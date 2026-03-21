package reviews

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"vibemap/backend/internal/api"
)

type Document struct {
	ID         string  `json:"id"`
	Poi        api.Poi `json:"poi"`
	Summary    string  `json:"summary"`
	Evidence   string  `json:"evidence,omitempty"`
	SearchText string  `json:"searchText"`
}

type Repository struct {
	path string
	docs []Document
}

func NewRepository(path string) *Repository {
	return &Repository{path: path}
}

func (r *Repository) Load() error {
	candidates := []string{r.path}
	base := filepath.Base(r.path)
	if base == "data.json" {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(r.path), "..", "data", "data.json"),
			filepath.Join(filepath.Dir(r.path), "..", "..", "data", "data.json"),
			filepath.Join("..", "data", "data.json"),
			filepath.Join("..", "..", "data", "data.json"),
		)
	}

	var raw []byte
	var used string
	for _, candidate := range candidates {
		b, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		raw = b
		used = candidate
		break
	}
	if raw == nil {
		return fmt.Errorf("no review file found at %q", r.path)
	}

	var items []rawReviewItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return fmt.Errorf("parse reviews from %s: %w", used, err)
	}

	docs := make([]Document, 0, len(items))
	seen := map[string]int{}
	for idx, item := range items {
		doc, ok := toDocument(item, idx)
		if !ok {
			continue
		}
		if n, exists := seen[doc.ID]; exists {
			n++
			seen[doc.ID] = n
			doc.ID = fmt.Sprintf("%s_%d", doc.ID, n)
			doc.Poi.ID = doc.ID
		} else {
			seen[doc.ID] = 1
		}
		docs = append(docs, doc)
	}

	if len(docs) == 0 {
		return fmt.Errorf("no usable review documents found in %s", filepath.Clean(used))
	}

	r.docs = docs
	return nil
}

func (r *Repository) List() []Document {
	out := make([]Document, len(r.docs))
	copy(out, r.docs)
	return out
}

type rawReviewItem struct {
	VideoID          string `json:"video_id"`
	VideoURL         string `json:"video_url"`
	PoiName          string `json:"poi_name"`
	PoiAddress       string `json:"poi_address"`
	PoiCity          string `json:"poi_city"`
	Lat              string `json:"lat"`
	Lng              string `json:"lng"`
	CharacteristicVI string `json:"characteristic_vi"`
	Evidence         string `json:"evidence"`
}

func toDocument(item rawReviewItem, idx int) (Document, bool) {
	name := strings.TrimSpace(item.PoiName)
	if name == "" {
		return Document{}, false
	}
	lat, err1 := strconv.ParseFloat(strings.TrimSpace(item.Lat), 64)
	lng, err2 := strconv.ParseFloat(strings.TrimSpace(item.Lng), 64)
	if err1 != nil || err2 != nil {
		return Document{}, false
	}

	id := makeStableID(name)
	if id == "" {
		id = fmt.Sprintf("review_%d", idx)
	}

	var addressPtr *string
	if v := strings.TrimSpace(item.PoiAddress); v != "" {
		addressPtr = &v
	}
	var cityPtr *string
	if v := strings.TrimSpace(item.PoiCity); v != "" {
		cityPtr = &v
	}
	var videoIDPtr *string
	if v := strings.TrimSpace(item.VideoID); v != "" {
		videoIDPtr = &v
	}
	var videoURLPtr *string
	if v := strings.TrimSpace(item.VideoURL); v != "" {
		videoURLPtr = &v
	}

	summary := cleanText(item.CharacteristicVI)
	evidence := cleanText(item.Evidence)
	searchParts := []string{name}
	if addressPtr != nil {
		searchParts = append(searchParts, *addressPtr)
	}
	if cityPtr != nil {
		searchParts = append(searchParts, *cityPtr)
	}
	if summary != "" {
		searchParts = append(searchParts, summary)
	}
	if evidence != "" {
		searchParts = append(searchParts, evidence)
	}

	return Document{
		ID: id,
		Poi: api.Poi{
			ID:       id,
			Name:     name,
			Location: api.LatLng{Lat: lat, Lng: lng},
			Address:  addressPtr,
			City:     cityPtr,
			VideoURL: videoURLPtr,
			VideoID:  videoIDPtr,
			Badges:   []string{"Trending on TikTok"},
		},
		Summary:    summary,
		Evidence:   evidence,
		SearchText: strings.Join(searchParts, "\n"),
	}, true
}

var reviewNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func makeStableID(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = reviewNonAlnum.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		return ""
	}
	if len(s) > 48 {
		s = strings.Trim(s[:48], "_")
	}
	return "review_" + s
}

func cleanText(v string) string {
	v = strings.TrimSpace(v)
	v = strings.ReplaceAll(v, "\r\n", "\n")
	v = strings.ReplaceAll(v, "\r", "\n")
	return strings.TrimSpace(v)
}
