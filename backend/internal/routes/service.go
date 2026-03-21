package routes

import (
	"context"
	"hash/fnv"
	"math"
	"sort"
	"strings"
	"time"

	"vibemap/backend/internal/api"
	"vibemap/backend/internal/geocode"
	"vibemap/backend/internal/ors"
)

type Service struct {
	pois     []api.Poi
	geocoder *geocode.Client
	ors      *ors.Client
}

func NewService(pois []api.Poi, orsKey, vietmapKey string) *Service {
	return &Service{
		pois:     pois,
		geocoder: geocode.NewClient(orsKey, vietmapKey),
		ors:      ors.NewClient(orsKey),
	}
}

func (s *Service) Plan(ctx context.Context, req api.RoutePlanRequest) (api.RoutePlan, error) {
	budget := req.TimeBudgetMinutes
	if budget <= 0 {
		budget = 180
	}
	if budget < 120 {
		budget = 120
	}
	if budget > 480 {
		budget = 480
	}

	mode := req.TransportMode
	if mode == "" {
		mode = api.TransportModeBike
	}

	ctx, cancel := context.WithTimeout(ctx, 22*time.Second)
	defer cancel()

	originPt, err := s.geocoder.Geocode(ctx, req.Origin)
	if err != nil {
		originPt = fallbackPoint(req.Origin)
	}
	destPt, err := s.geocoder.Geocode(ctx, req.Destination)
	if err != nil {
		destPt = fallbackPoint(req.Destination)
	}

	dwellPerStop := 18
	profile := ors.Profile(mode)
	targetStops := targetStopsForBudget(budget)
	stops := pickStopsKnapsack(s.pois, originPt, destPt, budget, mode, dwellPerStop, targetStops, req.IncludeTrending)
	if len(stops) == 0 && len(s.pois) > 0 && targetStops > 0 {
		stops = pickFallbackStopsByValue(s.pois, originPt, destPt, targetStops, req.IncludeTrending)
	}
	tryStops := stops

	var best api.RoutePlan
	var bestOk bool
	for {
		coords := make([]api.LatLng, 0, len(tryStops)+2)
		coords = append(coords, originPt)
		for _, p := range tryStops {
			coords = append(coords, p.Location)
		}
		coords = append(coords, destPt)

		plan, ok := buildPlan(ctx, s.ors, profile, mode, req, originPt, destPt, tryStops, coords, budget, dwellPerStop)
		if ok {
			return plan, nil
		}
		if !bestOk {
			best = plan
			bestOk = true
		}
		if len(tryStops) == 0 {
			break
		}
		tryStops = dropLowestUtilityStop(tryStops, originPt, destPt, mode, dwellPerStop, req.IncludeTrending)
	}

	if bestOk {
		return best, nil
	}
	coords := []api.LatLng{originPt, destPt}
	plan, _ := buildPlan(ctx, s.ors, profile, mode, req, originPt, destPt, []api.Poi{}, coords, budget, dwellPerStop)
	return plan, nil
}

func (s *Service) PlanNormal(ctx context.Context, req api.RoutePlanRequest) (api.RoutePlan, error) {
	mode := req.TransportMode
	if mode == "" {
		mode = api.TransportModeBike
	}

	ctx, cancel := context.WithTimeout(ctx, 22*time.Second)
	defer cancel()

	originPt, err := s.geocoder.Geocode(ctx, req.Origin)
	if err != nil {
		originPt = fallbackPoint(req.Origin)
	}
	destPt, err := s.geocoder.Geocode(ctx, req.Destination)
	if err != nil {
		destPt = fallbackPoint(req.Destination)
	}

	coords := []api.LatLng{originPt, destPt}
	profile := ors.Profile(mode)
	directions, err := s.ors.Directions(ctx, profile, coords)
	if err != nil {
		minutes := estimateTravelMinutes(originPt, destPt, mode)
		plan := api.RoutePlan{
			ID:          newID("route"),
			Title:       "Normal Route",
			Origin:      &api.NamedPoint{Location: originPt, Name: strPtr(strings.TrimSpace(req.Origin))},
			Destination: &api.NamedPoint{Location: destPt, Name: strPtr(strings.TrimSpace(req.Destination))},
			Pois:        []api.Poi{},
			Legs: []api.RouteLeg{
				{
					DurationMinutes: minutes,
					Path:            []api.LatLng{originPt, destPt},
					Steps:           stepsForLeg("", "", minutes),
				},
			},
			TotalDurationMinutes: minutes,
		}
		return plan, nil
	}

	legs := make([]api.RouteLeg, 0, len(directions.Segments))
	total := 0
	for _, seg := range directions.Segments {
		total += seg.DurationMinutes
		legs = append(legs, api.RouteLeg{
			DurationMinutes: seg.DurationMinutes,
			Path:            seg.Path,
			Steps:           seg.Steps,
		})
	}
	if total < 1 {
		total = 1
	}

	plan := api.RoutePlan{
		ID:                   newID("route"),
		Title:                "Normal Route",
		Origin:               &api.NamedPoint{Location: originPt, Name: strPtr(strings.TrimSpace(req.Origin))},
		Destination:          &api.NamedPoint{Location: destPt, Name: strPtr(strings.TrimSpace(req.Destination))},
		Pois:                 []api.Poi{},
		Legs:                 legs,
		TotalDurationMinutes: total,
	}
	return plan, nil
}

func strPtr(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return &v
}

func fallbackPoint(seed string) api.LatLng {
	h := fnv.New32a()
	_, _ = h.Write([]byte(seed))
	v := h.Sum32()
	baseLat := 10.7757
	baseLng := 106.7008
	o1 := float64(int(v%200)-100) / 10000.0
	o2 := float64(int((v/200)%200)-100) / 10000.0
	return api.LatLng{Lat: baseLat + o1, Lng: baseLng + o2}
}

type knapsackCandidate struct {
	poi      api.Poi
	weight   int
	value    int64
	progress float64
}

func pickStopsKnapsack(
	pois []api.Poi,
	origin api.LatLng,
	dest api.LatLng,
	budget int,
	mode api.TransportMode,
	dwellPerStop int,
	targetStops int,
	includeTrending bool,
) []api.Poi {
	if len(pois) == 0 {
		return []api.Poi{}
	}

	baseTravel := estimateTravelMinutes(origin, dest, mode)
	capacity := budget - baseTravel
	if capacity <= dwellPerStop {
		return []api.Poi{}
	}

	maxStops := targetStops
	if maxStops < 1 {
		return []api.Poi{}
	}
	if maxStops > 3 {
		maxStops = 3
	}

	cands := make([]knapsackCandidate, 0, len(pois))
	for _, p := range pois {
		value := poiValueForKnapsack(p, includeTrending)
		if value <= 0 {
			continue
		}
		progress, distToPath := lineProgressAndDistanceMeters(origin, dest, p.Location)
		if distToPath > 9000 {
			continue
		}
		detour := detourMinutesEstimate(distToPath, mode)
		weight := dwellPerStop + detour
		if weight > capacity {
			continue
		}
		cands = append(cands, knapsackCandidate{
			poi:      p,
			weight:   weight,
			value:    value,
			progress: progress,
		})
	}

	if len(cands) == 0 {
		return []api.Poi{}
	}

	sort.Slice(cands, func(i, j int) bool {
		if cands[i].value != cands[j].value {
			return cands[i].value > cands[j].value
		}
		if cands[i].weight != cands[j].weight {
			return cands[i].weight < cands[j].weight
		}
		return cands[i].poi.ID < cands[j].poi.ID
	})
	if len(cands) > 64 {
		cands = cands[:64]
	}

	selected := solveKnapsack(cands, capacity, maxStops)
	if len(selected) == 0 {
		return []api.Poi{}
	}

	sort.Slice(selected, func(i, j int) bool {
		if selected[i].progress != selected[j].progress {
			return selected[i].progress < selected[j].progress
		}
		return selected[i].poi.ID < selected[j].poi.ID
	})

	out := make([]api.Poi, 0, len(selected))
	for _, item := range selected {
		out = append(out, item.poi)
	}
	return out
}

func targetStopsForBudget(budget int) int {
	if budget <= 180 {
		return 1
	}
	if budget <= 300 {
		return 2
	}
	return 3
}

type fallbackCandidate struct {
	poi      api.Poi
	value    int64
	progress float64
	dist     float64
}

func pickFallbackStopsByValue(
	pois []api.Poi,
	origin api.LatLng,
	dest api.LatLng,
	targetStops int,
	includeTrending bool,
) []api.Poi {
	if targetStops < 1 {
		return []api.Poi{}
	}
	if targetStops > 3 {
		targetStops = 3
	}
	cands := make([]fallbackCandidate, 0, len(pois))
	for _, p := range pois {
		value := poiValueForKnapsack(p, includeTrending)
		if value <= 0 {
			continue
		}
		progress, dist := lineProgressAndDistanceMeters(origin, dest, p.Location)
		cands = append(cands, fallbackCandidate{
			poi:      p,
			value:    value,
			progress: progress,
			dist:     dist,
		})
	}
	if len(cands) == 0 {
		return []api.Poi{}
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].value != cands[j].value {
			return cands[i].value > cands[j].value
		}
		if cands[i].dist != cands[j].dist {
			return cands[i].dist < cands[j].dist
		}
		return cands[i].poi.ID < cands[j].poi.ID
	})
	if len(cands) > targetStops {
		cands = cands[:targetStops]
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].progress != cands[j].progress {
			return cands[i].progress < cands[j].progress
		}
		return cands[i].poi.ID < cands[j].poi.ID
	})
	out := make([]api.Poi, 0, len(cands))
	for _, c := range cands {
		out = append(out, c.poi)
	}
	return out
}

func solveKnapsack(cands []knapsackCandidate, capacity int, maxItems int) []knapsackCandidate {
	if len(cands) == 0 || capacity <= 0 || maxItems <= 0 {
		return []knapsackCandidate{}
	}
	if maxItems > len(cands) {
		maxItems = len(cands)
	}

	negInf := int64(-1 << 60)
	n := len(cands)
	dp := make([][][]int64, n+1)
	take := make([][][]bool, n+1)
	for i := 0; i <= n; i++ {
		dp[i] = make([][]int64, capacity+1)
		take[i] = make([][]bool, capacity+1)
		for w := 0; w <= capacity; w++ {
			dp[i][w] = make([]int64, maxItems+1)
			take[i][w] = make([]bool, maxItems+1)
			for k := 0; k <= maxItems; k++ {
				dp[i][w][k] = negInf
			}
		}
	}
	dp[0][0][0] = 0

	for i := 1; i <= n; i++ {
		item := cands[i-1]
		for w := 0; w <= capacity; w++ {
			for k := 0; k <= maxItems; k++ {
				dp[i][w][k] = dp[i-1][w][k]
				if k > 0 && w >= item.weight && dp[i-1][w-item.weight][k-1] != negInf {
					v := dp[i-1][w-item.weight][k-1] + item.value
					if v > dp[i][w][k] {
						dp[i][w][k] = v
						take[i][w][k] = true
					}
				}
			}
		}
	}

	bestValue := int64(0)
	bestW := 0
	bestK := 0
	for w := 0; w <= capacity; w++ {
		for k := 0; k <= maxItems; k++ {
			v := dp[n][w][k]
			if v > bestValue || (v == bestValue && k > bestK) || (v == bestValue && k == bestK && w < bestW) {
				bestValue = v
				bestW = w
				bestK = k
			}
		}
	}
	if bestValue <= 0 {
		return []knapsackCandidate{}
	}

	selection := make([]knapsackCandidate, 0, bestK)
	w := bestW
	k := bestK
	for i := n; i >= 1 && k >= 0; i-- {
		if !take[i][w][k] {
			continue
		}
		item := cands[i-1]
		selection = append(selection, item)
		w -= item.weight
		k--
	}

	for i, j := 0, len(selection)-1; i < j; i, j = i+1, j-1 {
		selection[i], selection[j] = selection[j], selection[i]
	}
	return selection
}

func dropLowestUtilityStop(
	stops []api.Poi,
	origin api.LatLng,
	dest api.LatLng,
	mode api.TransportMode,
	dwellPerStop int,
	includeTrending bool,
) []api.Poi {
	if len(stops) == 0 {
		return stops
	}
	if len(stops) == 1 {
		return []api.Poi{}
	}

	lowestIdx := 0
	lowestScore := math.MaxFloat64
	for i, poi := range stops {
		value := float64(poiValueForKnapsack(poi, includeTrending))
		_, distToPath := lineProgressAndDistanceMeters(origin, dest, poi.Location)
		weight := float64(dwellPerStop + detourMinutesEstimate(distToPath, mode))
		score := value / math.Max(1.0, weight)
		if score < lowestScore {
			lowestScore = score
			lowestIdx = i
		}
	}

	out := make([]api.Poi, 0, len(stops)-1)
	out = append(out, stops[:lowestIdx]...)
	out = append(out, stops[lowestIdx+1:]...)
	return out
}

func poiValueForKnapsack(p api.Poi, includeTrending bool) int64 {
	if p.VideoPlaycount != nil && *p.VideoPlaycount > 0 {
		v := *p.VideoPlaycount
		if includeTrending {
			for _, b := range p.Badges {
				if strings.EqualFold(strings.TrimSpace(b), "Trending on TikTok") {
					v = int64(math.Round(float64(v) * 1.08))
					break
				}
			}
		}
		return v
	}

	v := int64(1000)
	if p.Rating != nil && *p.Rating > 0 {
		v += int64(math.Round(*p.Rating * 100000))
	}
	if includeTrending {
		for _, b := range p.Badges {
			if strings.EqualFold(strings.TrimSpace(b), "Trending on TikTok") {
				v += 120000
			}
		}
	}
	return v
}

func lineProgressAndDistanceMeters(origin, dest, p api.LatLng) (float64, float64) {
	dx, dy := toXYMeters(dest, origin)
	px, py := toXYMeters(p, origin)

	denom := dx*dx + dy*dy
	if denom < 1e-9 {
		return 0, math.Hypot(px, py)
	}

	t := (px*dx + py*dy) / denom
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}

	cx := t * dx
	cy := t * dy
	dist := math.Hypot(px-cx, py-cy)
	return t, dist
}

func toXYMeters(p, ref api.LatLng) (float64, float64) {
	const earthR = 6371000.0
	lat1 := ref.Lat * math.Pi / 180.0
	lat2 := p.Lat * math.Pi / 180.0
	lngDelta := (p.Lng - ref.Lng) * math.Pi / 180.0
	latDelta := (p.Lat - ref.Lat) * math.Pi / 180.0

	x := lngDelta * earthR * math.Cos((lat1+lat2)/2.0)
	y := latDelta * earthR
	return x, y
}

func detourMinutesEstimate(distanceToPathMeters float64, mode api.TransportMode) int {
	detourMeters := 260.0 + distanceToPathMeters*1.9
	if detourMeters < 320 {
		detourMeters = 320
	}
	return minutesForMeters(detourMeters, mode)
}

func minutesForMeters(distanceMeters float64, mode api.TransportMode) int {
	speedKmh := 18.0
	switch mode {
	case api.TransportModeWalk:
		speedKmh = 4.2
	case api.TransportModeCar:
		speedKmh = 16.0
	case api.TransportModeBus:
		speedKmh = 14.0
	default:
		speedKmh = 18.0
	}
	hours := (distanceMeters / 1000.0) / speedKmh
	mins := int(math.Round(hours * 60.0))
	if mins < 2 {
		mins = 2
	}
	return mins
}

func buildPlan(
	ctx context.Context,
	orsClient *ors.Client,
	profile string,
	mode api.TransportMode,
	req api.RoutePlanRequest,
	originPt api.LatLng,
	destPt api.LatLng,
	stops []api.Poi,
	coords []api.LatLng,
	budget int,
	dwellPerStop int,
) (api.RoutePlan, bool) {
	directions, err := orsClient.Directions(ctx, profile, coords)
	if err != nil {
		legs := make([]api.RouteLeg, 0, max(1, len(coords)-1))
		travelTotal := 0
		for i := 0; i < len(coords)-1; i++ {
			from := coords[i]
			to := coords[i+1]
			minutes := estimateTravelMinutes(from, to, mode)
			travelTotal += minutes

			var fromID *string
			var toID *string
			if i == 0 {
				if len(stops) > 0 {
					v := stops[0].ID
					toID = &v
				}
			} else if i == len(coords)-2 {
				if len(stops) > 0 {
					v := stops[len(stops)-1].ID
					fromID = &v
				}
			} else {
				f := stops[i-1].ID
				t := stops[i].ID
				fromID = &f
				toID = &t
			}

			legs = append(legs, api.RouteLeg{
				FromPoiID:       fromID,
				ToPoiID:         toID,
				DurationMinutes: minutes,
				Path:            []api.LatLng{from, to},
				Steps:           stepsForLeg("", "", minutes),
			})
		}

		title := "Vibe Route"
		if req.IncludeTrending {
			title = "Vibe Route (Trending Cut)"
		}
		total := travelTotal + (len(stops) * dwellPerStop)
		if total < 30 {
			total = 30
		}
		if total > budget {
			total = budget
		}

		plan := api.RoutePlan{
			ID:                   newID("route"),
			Title:                title,
			Origin:               &api.NamedPoint{Location: originPt, Name: strPtr(strings.TrimSpace(req.Origin))},
			Destination:          &api.NamedPoint{Location: destPt, Name: strPtr(strings.TrimSpace(req.Destination))},
			Pois:                 stops,
			Legs:                 legs,
			TotalDurationMinutes: total,
		}
		return plan, total <= budget
	}

	legs := make([]api.RouteLeg, 0, len(directions.Segments))
	travelTotal := 0
	for i, seg := range directions.Segments {
		travelTotal += seg.DurationMinutes
		var fromID *string
		var toID *string
		if i == 0 {
			if len(stops) > 0 {
				to := stops[0].ID
				toID = &to
			}
		} else if i == len(directions.Segments)-1 {
			if len(stops) > 0 {
				from := stops[len(stops)-1].ID
				fromID = &from
			}
		} else {
			from := stops[i-1].ID
			to := stops[i].ID
			fromID = &from
			toID = &to
		}
		legs = append(legs, api.RouteLeg{
			FromPoiID:       fromID,
			ToPoiID:         toID,
			DurationMinutes: seg.DurationMinutes,
			Path:            seg.Path,
			Steps:           seg.Steps,
		})
	}

	title := "Vibe Route"
	if req.IncludeTrending {
		title = "Vibe Route (Trending Cut)"
	}
	total := travelTotal + (len(stops) * dwellPerStop)
	if total < 30 {
		total = 30
	}
	ok := total <= budget
	if total > budget {
		total = budget
	}

	plan := api.RoutePlan{
		ID:                   newID("route"),
		Title:                title,
		Origin:               &api.NamedPoint{Location: originPt, Name: strPtr(strings.TrimSpace(req.Origin))},
		Destination:          &api.NamedPoint{Location: destPt, Name: strPtr(strings.TrimSpace(req.Destination))},
		Pois:                 stops,
		Legs:                 legs,
		TotalDurationMinutes: total,
	}
	return plan, ok
}
