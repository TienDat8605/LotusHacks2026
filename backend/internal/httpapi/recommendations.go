package httpapi

import (
	"math"
	"sort"

	"vibemap/backend/internal/api"
)

type scoredPoi struct {
	poi   api.Poi
	score float64
}

func rankPoisForParticipants(pois []api.Poi, participants []api.SocialParticipant, limit int) []api.Poi {
	points := make([]api.LatLng, 0, len(participants))
	for _, p := range participants {
		if p.Lat == nil || p.Lng == nil {
			continue
		}
		points = append(points, api.LatLng{Lat: *p.Lat, Lng: *p.Lng})
	}

	if limit <= 0 {
		limit = 5
	}
	if len(pois) == 0 {
		return []api.Poi{}
	}
	if len(points) == 0 {
		if len(pois) < limit {
			limit = len(pois)
		}
		out := make([]api.Poi, 0, limit)
		for i := 0; i < limit; i++ {
			out = append(out, pois[i])
		}
		return out
	}

	scored := make([]scoredPoi, 0, len(pois))
	for _, poi := range pois {
		sum := 0.0
		maxD := 0.0
		for _, pt := range points {
			d := haversineMeters(pt.Lat, pt.Lng, poi.Location.Lat, poi.Location.Lng)
			sum += d
			if d > maxD {
				maxD = d
			}
		}
		score := sum + (maxD * 0.25)
		scored = append(scored, scoredPoi{poi: poi, score: score})
	}

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score < scored[j].score
		}
		return scored[i].poi.ID < scored[j].poi.ID
	})

	if len(scored) < limit {
		limit = len(scored)
	}
	out := make([]api.Poi, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, scored[i].poi)
	}
	return out
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

