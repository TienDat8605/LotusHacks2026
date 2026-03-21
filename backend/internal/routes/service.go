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
		budget = 150
	}
	if budget < 30 {
		budget = 30
	}
	if budget > 8*60 {
		budget = 8 * 60
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
	maxStops := int(math.Floor(float64(budget) / float64(dwellPerStop+18)))
	if maxStops < 1 {
		maxStops = 1
	}
	if maxStops > 3 {
		maxStops = 3
	}

	profile := ors.Profile(mode)

	var best api.RoutePlan
	var bestOk bool
	for n := maxStops; n >= 1; n-- {
		stops := pickStops(s.pois, originPt, destPt, n)
		coords := make([]api.LatLng, 0, len(stops)+2)
		coords = append(coords, originPt)
		for _, p := range stops {
			coords = append(coords, p.Location)
		}
		coords = append(coords, destPt)

		plan, ok := buildPlan(ctx, s.ors, profile, mode, req, originPt, destPt, stops, coords, budget, dwellPerStop)
		if ok {
			return plan, nil
		}
		if !bestOk {
			best = plan
			bestOk = true
		}
	}

	if bestOk {
		return best, nil
	}

	stops := pickStops(s.pois, originPt, destPt, 1)
	coords := []api.LatLng{originPt, destPt}
	plan, _ := buildPlan(ctx, s.ors, profile, mode, req, originPt, destPt, stops, coords, budget, dwellPerStop)
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

type scored struct {
	poi   api.Poi
	score float64
}

func pickStops(pois []api.Poi, origin, dest api.LatLng, targetStops int) []api.Poi {
	if len(pois) == 0 {
		return []api.Poi{}
	}
	if targetStops < 1 {
		targetStops = 1
	}
	if targetStops > 3 {
		targetStops = 3
	}

	mid := api.LatLng{Lat: (origin.Lat + dest.Lat) / 2.0, Lng: (origin.Lng + dest.Lng) / 2.0}
	od := haversineMeters(origin.Lat, origin.Lng, dest.Lat, dest.Lng)
	radius := math.Max(2500, math.Min(8000, od*0.55))

	cands := make([]scored, 0, len(pois))
	for _, p := range pois {
		d := haversineMeters(mid.Lat, mid.Lng, p.Location.Lat, p.Location.Lng)
		if d > radius {
			continue
		}
		s := 1.0 / math.Max(1.0, d)
		cands = append(cands, scored{poi: p, score: s})
	}
	if len(cands) == 0 {
		for _, p := range pois {
			d := haversineMeters(mid.Lat, mid.Lng, p.Location.Lat, p.Location.Lng)
			s := 1.0 / math.Max(1.0, d)
			cands = append(cands, scored{poi: p, score: s})
		}
	}

	sort.Slice(cands, func(i, j int) bool {
		if cands[i].score != cands[j].score {
			return cands[i].score > cands[j].score
		}
		return cands[i].poi.ID < cands[j].poi.ID
	})

	if len(cands) < targetStops {
		targetStops = len(cands)
	}
	stops := make([]api.Poi, 0, targetStops)
	for i := 0; i < targetStops; i++ {
		stops = append(stops, cands[i].poi)
	}
	return stops
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
