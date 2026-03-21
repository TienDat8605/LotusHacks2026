package ors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"vibemap/backend/internal/api"
)

type Client struct {
	key  string
	http *http.Client
}

func NewClient(key string) *Client {
	return &Client{
		key: strings.TrimSpace(key),
		http: &http.Client{
			Timeout: 18 * time.Second,
		},
	}
}

func Profile(mode api.TransportMode) string {
	switch mode {
	case api.TransportModeWalk:
		return "foot-walking"
	case api.TransportModeBike:
		return "cycling-regular"
	case api.TransportModeCar:
		return "driving-car"
	case api.TransportModeBus:
		return "driving-car"
	default:
		return "driving-car"
	}
}

type DirectionsResult struct {
	Segments []Segment
}

type Segment struct {
	DurationMinutes int
	Path            []api.LatLng
	Steps           []api.RouteStep
}

func (c *Client) Directions(ctx context.Context, profile string, coords []api.LatLng) (*DirectionsResult, error) {
	if c.key == "" {
		return nil, fmt.Errorf("missing ORS_API_KEY")
	}
	if len(coords) < 2 {
		return nil, fmt.Errorf("need at least 2 points")
	}

	body := struct {
		Coordinates  [][]float64 `json:"coordinates"`
		Instructions bool        `json:"instructions"`
		Language     string      `json:"language"`
	}{
		Coordinates:  make([][]float64, 0, len(coords)),
		Instructions: true,
		Language:     "en",
	}
	for _, p := range coords {
		body.Coordinates = append(body.Coordinates, []float64{p.Lng, p.Lat})
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://api.openrouteservice.org/v2/directions/%s/geojson", profile)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.key)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ors directions status %d", res.StatusCode)
	}

	var parsed struct {
		Features []struct {
			Properties struct {
				Segments []struct {
					Duration float64 `json:"duration"`
					Steps    []struct {
						Instruction string  `json:"instruction"`
						Distance    float64 `json:"distance"`
						Duration    float64 `json:"duration"`
					} `json:"steps"`
				} `json:"segments"`
				WayPoints []int `json:"way_points"`
			} `json:"properties"`
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"features"`
	}

	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Features) == 0 {
		return nil, fmt.Errorf("ors directions empty")
	}

	f := parsed.Features[0]
	coordsRaw := f.Geometry.Coordinates
	way := f.Properties.WayPoints
	segmentsRaw := f.Properties.Segments
	if len(way) < 2 || len(segmentsRaw) == 0 || len(coordsRaw) == 0 {
		return nil, fmt.Errorf("ors directions missing fields")
	}

	segments := make([]Segment, 0, len(segmentsRaw))
	for i := 0; i < len(segmentsRaw) && i+1 < len(way); i++ {
		start := way[i]
		end := way[i+1]
		if start < 0 || end < 0 || start >= len(coordsRaw) || end >= len(coordsRaw) || start > end {
			continue
		}
		path := make([]api.LatLng, 0, end-start+1)
		for j := start; j <= end; j++ {
			c2 := coordsRaw[j]
			if len(c2) < 2 {
				continue
			}
			path = append(path, api.LatLng{Lat: c2[1], Lng: c2[0]})
		}

		steps := make([]api.RouteStep, 0, len(segmentsRaw[i].Steps))
		for _, st := range segmentsRaw[i].Steps {
			dm := int(st.Distance)
			mins := int(st.Duration / 60.0)
			if mins < 0 {
				mins = 0
			}
			steps = append(steps, api.RouteStep{
				Instruction:     st.Instruction,
				DistanceMeters:  &dm,
				DurationMinutes: &mins,
			})
		}

		legMins := int(segmentsRaw[i].Duration / 60.0)
		if legMins < 1 {
			legMins = 1
		}
		segments = append(segments, Segment{
			DurationMinutes: legMins,
			Path:            path,
			Steps:           steps,
		})
	}

	if len(segments) == 0 {
		return nil, fmt.Errorf("ors directions no segments")
	}
	return &DirectionsResult{Segments: segments}, nil
}
