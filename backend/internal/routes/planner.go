package routes

import (
	"crypto/rand"
	"encoding/hex"
	"math"
	"sort"
	"strings"
	"time"

	"vibemap/backend/internal/api"
)

type Planner struct {
	pois []api.Poi
}

func NewPlanner(pois []api.Poi) *Planner {
	return &Planner{pois: pois}
}

func (p *Planner) Plan(req api.RoutePlanRequest) api.RoutePlan {
	budget := req.TimeBudgetMinutes
	if budget <= 0 {
		budget = 120
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

	candidates := make([]scoredPoi, 0, len(p.pois))
	for _, poi := range p.pois {
		candidates = append(candidates, scoredPoi{Poi: poi, Score: scorePoi(poi, req.IncludeTrending)})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Score != candidates[j].Score {
			return candidates[i].Score > candidates[j].Score
		}
		return candidates[i].Poi.ID < candidates[j].Poi.ID
	})

	targetStops := int(math.Round(float64(budget) / 50.0))
	if targetStops < 2 {
		targetStops = 2
	}
	if targetStops > 5 {
		targetStops = 5
	}

	picked := make([]api.Poi, 0, targetStops)
	for _, c := range candidates {
		if len(picked) >= targetStops {
			break
		}
		picked = append(picked, c.Poi)
	}

	legs := make([]api.RouteLeg, 0, max(1, len(picked)-1))
	totalLegMinutes := 0
	for i := 0; i < max(1, len(picked)-1); i++ {
		from := picked[i]
		to := picked[i+1]
		minutes := estimateTravelMinutes(from.Location, to.Location, mode)
		totalLegMinutes += minutes
		fromID := from.ID
		toID := to.ID
		legs = append(legs, api.RouteLeg{
			FromPoiID:       &fromID,
			ToPoiID:         &toID,
			DurationMinutes: minutes,
			Steps:           stepsForLeg(from.Name, to.Name, minutes),
		})
	}

	dwellPerStop := 18
	total := totalLegMinutes + (len(picked) * dwellPerStop)
	if total < 30 {
		total = 30
	}
	if total > budget {
		total = budget
	}

	title := "Urban Pulse"
	if req.IncludeTrending {
		title = "Urban Pulse (Trending Cut)"
	}
	if strings.TrimSpace(req.Origin) != "" || strings.TrimSpace(req.Destination) != "" {
		title = "Vibe Route"
		if req.IncludeTrending {
			title = "Vibe Route (Trending Cut)"
		}
	}

	return api.RoutePlan{
		ID:                   newID("route"),
		Title:                title,
		Pois:                 picked,
		Legs:                 legs,
		TotalDurationMinutes: total,
	}
}

type scoredPoi struct {
	Poi   api.Poi
	Score float64
}

func scorePoi(p api.Poi, includeTrending bool) float64 {
	score := 0.0
	if p.Rating != nil {
		score += *p.Rating
	}
	for _, b := range p.Badges {
		badge := strings.ToLower(strings.TrimSpace(b))
		if badge == "curator pick" {
			score += 0.8
		}
		if includeTrending && badge == strings.ToLower("Trending on TikTok") {
			score += 1.2
		}
		if badge == "photogenic" {
			score += 0.4
		}
	}
	return score
}

func estimateTravelMinutes(a, b api.LatLng, mode api.TransportMode) int {
	d := haversineMeters(a.Lat, a.Lng, b.Lat, b.Lng)
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
	hours := (d / 1000.0) / speedKmh
	mins := int(math.Round(hours * 60.0))
	if mins < 2 {
		mins = 2
	}
	return mins
}

func stepsForLeg(fromName, toName string, minutes int) []api.RouteStep {
	a := max(1, int(math.Round(float64(minutes)*0.25)))
	b := max(1, int(math.Round(float64(minutes)*0.45)))
	c := max(1, minutes-a-b)

	return []api.RouteStep{
		{Instruction: "Head towards the main boulevard", DurationMinutes: &a},
		{Instruction: "Follow the route along the riverside", DurationMinutes: &b},
		{Instruction: "Arrive at the next curated stop", DurationMinutes: &c},
	}
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func newID(prefix string) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return prefix + "_" + time.Now().Format("20060102150405")
	}
	return prefix + "_" + hex.EncodeToString(b)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
