package pois

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

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
	base := filepath.Base(r.path)
	if base == "pois.json" {
		candidates = append(candidates, filepath.Join(filepath.Dir(r.path), "pois.sample.json"))
	}
	if base == "data.json" {
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

	pois, err := decodePois(raw)
	if err != nil {
		r.pois = defaultPois()
		return fmt.Errorf("parse POIs from %s: %w", used, err)
	}

	r.pois = normalizePois(pois)
	return nil
}

func decodePois(raw []byte) ([]api.Poi, error) {
	var direct []api.Poi
	if err := json.Unmarshal(raw, &direct); err == nil {
		if len(direct) > 0 {
			usable := 0
			for _, p := range direct {
				if strings.TrimSpace(p.Name) != "" {
					usable++
					break
				}
			}
			if usable > 0 {
				return direct, nil
			}
		}
	}

	var items []rawPoiItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errors.New("empty POI dataset")
	}

	out := make([]api.Poi, 0, len(items))
	seen := map[string]struct{}{}
	for idx, it := range items {
		name := strings.TrimSpace(it.PoiName)
		if name == "" {
			continue
		}
		lat, err1 := parseFloatLoose(it.Lat)
		lng, err2 := parseFloatLoose(it.Lng)
		if err1 != nil || err2 != nil {
			continue
		}
		key := fmt.Sprintf("%s|%.6f|%.6f", strings.ToLower(name), lat, lng)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		id := makeStableID(name)
		if id == "" {
			id = fmt.Sprintf("poi_%d", idx)
		}
		badge := []string{"Trending on TikTok"}
		city := strings.TrimSpace(it.PoiCity)
		var cityPtr *string
		if city != "" {
			cityPtr = &city
		}
		address := strings.TrimSpace(it.PoiAddress)
		var addrPtr *string
		if address != "" {
			addrPtr = &address
		}
		videoURL := strings.TrimSpace(it.VideoURL)
		var videoURLPtr *string
		if videoURL != "" {
			videoURLPtr = &videoURL
		}
		videoID := strings.TrimSpace(it.VideoID)
		var videoIDPtr *string
		if videoID != "" {
			videoIDPtr = &videoID
		}
		out = append(out, api.Poi{
			ID:       id,
			Name:     name,
			Location: api.LatLng{Lat: lat, Lng: lng},
			Address:  addrPtr,
			City:     cityPtr,
			VideoURL: videoURLPtr,
			VideoID:  videoIDPtr,
			Category: nil,
			Badges:   badge,
		})
	}
	if len(out) == 0 {
		return nil, errors.New("no usable POIs after conversion")
	}
	return out, nil
}

type rawPoiItem struct {
	VideoID    string `json:"video_id"`
	VideoURL   string `json:"video_url"`
	PoiName    string `json:"poi_name"`
	PoiAddress string `json:"poi_address"`
	PoiCity    string `json:"poi_city"`
	Lat        string `json:"lat"`
	Lng        string `json:"lng"`
}

func parseFloatLoose(v string) (float64, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, errors.New("empty")
	}
	return strconv.ParseFloat(v, 64)
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func makeStableID(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = nonAlnum.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		return ""
	}
	if len(s) > 48 {
		s = s[:48]
		s = strings.Trim(s, "_")
	}
	return "poi_" + s
}

func normalizePois(items []api.Poi) []api.Poi {
	out := make([]api.Poi, 0, len(items))
	seen := map[string]int{}
	for _, p := range items {
		id := strings.TrimSpace(p.ID)
		name := strings.TrimSpace(p.Name)
		if name == "" {
			continue
		}
		if id == "" {
			id = makeStableID(name)
			if id == "" {
				continue
			}
		}
		if n, ok := seen[id]; ok {
			n++
			seen[id] = n
			id = fmt.Sprintf("%s_%d", id, n)
		} else {
			seen[id] = 1
		}
		p.ID = id
		p.Name = name
		out = append(out, p)
	}
	return out
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
