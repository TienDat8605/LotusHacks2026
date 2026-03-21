package pois

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"vibemap/backend/internal/api"
)

type Repository struct {
	path string
	pois []api.Poi
}

func NewRepository(path string) *Repository {
	return &Repository{path: path}
}

func (r *Repository) Load() error {
	candidates := []string{r.path}
	if filepath.Base(r.path) == "pois.json" {
		candidates = append(candidates, filepath.Join(filepath.Dir(r.path), "pois.sample.json"))
	}

	var raw []byte
	var used string
	for _, p := range candidates {
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		raw = b
		used = p
		break
	}

	if raw == nil {
		r.pois = defaultPois()
		return fmt.Errorf("no POI file found at %q (fallback to defaults)", r.path)
	}

	var items []api.Poi
	if err := json.Unmarshal(raw, &items); err != nil {
		r.pois = defaultPois()
		return fmt.Errorf("parse POIs from %s: %w", used, err)
	}

	filtered := make([]api.Poi, 0, len(items))
	for _, p := range items {
		if p.ID == "" || p.Name == "" {
			continue
		}
		filtered = append(filtered, p)
	}
	r.pois = filtered
	return nil
}

func (r *Repository) List() []api.Poi {
	out := make([]api.Poi, len(r.pois))
	copy(out, r.pois)
	return out
}

func defaultPois() []api.Poi {
	street := "Street Food"
	cafe := "Cafe"
	cocktails := "Cocktails"
	r1 := 4.6
	r2 := 4.8
	r3 := 4.9
	return []api.Poi{
		{
			ID:       "poi_ben_thanh",
			Name:     "Bến Thành Street Food",
			Location: api.LatLng{Lat: 10.772, Lng: 106.698},
			Category: &street,
			Rating:   &r1,
			Badges:   []string{"Trending on TikTok"},
		},
		{
			ID:       "poi_cafe_apts",
			Name:     "The Café Apartments",
			Location: api.LatLng{Lat: 10.775, Lng: 106.705},
			Category: &cafe,
			Rating:   &r2,
			Badges:   []string{"Photogenic"},
		},
		{
			ID:       "poi_hidden_gin",
			Name:     "Hidden Gin Bar",
			Location: api.LatLng{Lat: 10.781, Lng: 106.703},
			Category: &cocktails,
			Rating:   &r3,
			Badges:   []string{"Curator Pick"},
		},
	}
}
