package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"vibemap/backend/internal/api"
)

type Client struct {
	orsKey     string
	vietmapKey string
	http       *http.Client
}

type Suggestion struct {
	RefID    string     `json:"refId,omitempty"`
	Name     string     `json:"name"`
	Address  string     `json:"address,omitempty"`
	Location api.LatLng `json:"location"`
}

func NewClient(orsKey, vietmapKey string) *Client {
	return &Client{
		orsKey:     strings.TrimSpace(orsKey),
		vietmapKey: strings.TrimSpace(vietmapKey),
		http: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

func (c *Client) Geocode(ctx context.Context, text string) (api.LatLng, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return api.LatLng{}, fmt.Errorf("empty query")
	}

	if c.orsKey != "" {
		p, err := c.geocodeORS(ctx, text)
		if err == nil {
			return p, nil
		}
	}

	if c.vietmapKey != "" {
		p, err := c.geocodeVietmap(ctx, text)
		if err == nil {
			return p, nil
		}
	}

	p, err := c.geocodeOSM(ctx, text)
	if err == nil {
		return p, nil
	}

	return api.LatLng{}, fmt.Errorf("geocode failed")
}

func (c *Client) geocodeORS(ctx context.Context, text string) (api.LatLng, error) {
	q := url.Values{}
	q.Set("api_key", c.orsKey)
	q.Set("text", text)
	q.Set("boundary.country", "VN")
	q.Set("size", "1")

	reqURL := "https://api.openrouteservice.org/geocode/search?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return api.LatLng{}, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return api.LatLng{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return api.LatLng{}, fmt.Errorf("ors geocode status %d", res.StatusCode)
	}

	var parsed struct {
		Features []struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"features"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return api.LatLng{}, err
	}
	if len(parsed.Features) == 0 || len(parsed.Features[0].Geometry.Coordinates) < 2 {
		return api.LatLng{}, fmt.Errorf("ors geocode no result")
	}
	coords := parsed.Features[0].Geometry.Coordinates
	return api.LatLng{Lat: coords[1], Lng: coords[0]}, nil
}

func (c *Client) geocodeVietmap(ctx context.Context, text string) (api.LatLng, error) {
	suggestions, err := c.SearchVietmap(ctx, text, 1)
	if err != nil {
		return api.LatLng{}, err
	}
	if len(suggestions) == 0 {
		return api.LatLng{}, fmt.Errorf("vietmap search no result")
	}
	return suggestions[0].Location, nil
}

func (c *Client) geocodeOSM(ctx context.Context, text string) (api.LatLng, error) {
	results, err := c.searchOSM(ctx, text, 1)
	if err != nil {
		return api.LatLng{}, err
	}
	if len(results) == 0 {
		return api.LatLng{}, fmt.Errorf("osm search no result")
	}
	return results[0].Location, nil
}

func (c *Client) SearchVietmap(ctx context.Context, text string, limit int) ([]Suggestion, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("empty query")
	}
	if c.vietmapKey == "" {
		return nil, fmt.Errorf("missing VIETMAP_API_KEY")
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}

	searchResults, err := c.vietmapSearch(ctx, text)
	if err != nil {
		return nil, err
	}
	if len(searchResults) == 0 {
		return nil, fmt.Errorf("vietmap search no result")
	}

	out := make([]Suggestion, 0, limit)
	for _, item := range searchResults {
		if len(out) >= limit {
			break
		}

		refID := strings.TrimSpace(item.RefID)
		if refID == "" {
			continue
		}

		location, err := c.vietmapPlaceByRefID(ctx, refID)
		if err != nil {
			continue
		}

		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.Display)
		}
		if name == "" {
			name = text
		}

		address := strings.TrimSpace(item.Address)
		if address == "" {
			address = strings.TrimSpace(item.FullAddress)
		}
		if address == "" {
			display := strings.TrimSpace(item.Display)
			if display != "" && display != name {
				address = display
			}
		}

		out = append(out, Suggestion{
			RefID:    refID,
			Name:     name,
			Address:  address,
			Location: location,
		})
	}

	if len(out) == 0 {
		return nil, fmt.Errorf("vietmap search no result")
	}
	return out, nil
}

func (c *Client) Search(ctx context.Context, text string, limit int) ([]Suggestion, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("empty query")
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}

	if c.orsKey != "" {
		results, err := c.searchORS(ctx, text, limit)
		if err == nil && len(results) > 0 {
			return results, nil
		}
	}

	if c.vietmapKey != "" {
		results, err := c.SearchVietmap(ctx, text, limit)
		if err == nil && len(results) > 0 {
			return results, nil
		}
	}

	return c.searchOSM(ctx, text, limit)
}

func (c *Client) searchORS(ctx context.Context, text string, limit int) ([]Suggestion, error) {
	if c.orsKey == "" {
		return nil, fmt.Errorf("missing ORS_API_KEY")
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}

	q := url.Values{}
	q.Set("api_key", c.orsKey)
	q.Set("text", text)
	q.Set("boundary.country", "VN")
	q.Set("size", strconv.Itoa(limit))

	reqURL := "https://api.openrouteservice.org/geocode/search?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ors search status %d", res.StatusCode)
	}

	var parsed struct {
		Features []struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Name  string `json:"name"`
				Label string `json:"label"`
			} `json:"properties"`
		} `json:"features"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Features) == 0 {
		return nil, fmt.Errorf("ors search no result")
	}

	out := make([]Suggestion, 0, limit)
	for i, feature := range parsed.Features {
		if len(out) >= limit {
			break
		}
		if len(feature.Geometry.Coordinates) < 2 {
			continue
		}
		name := strings.TrimSpace(feature.Properties.Name)
		address := strings.TrimSpace(feature.Properties.Label)
		if name == "" && address != "" {
			if parts := strings.Split(address, ","); len(parts) > 0 {
				name = strings.TrimSpace(parts[0])
			}
		}
		if name == "" {
			name = text
		}
		out = append(out, Suggestion{
			RefID:    fmt.Sprintf("ors:%d", i),
			Name:     name,
			Address:  address,
			Location: api.LatLng{Lat: feature.Geometry.Coordinates[1], Lng: feature.Geometry.Coordinates[0]},
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("ors search no result")
	}
	return out, nil
}

type vietmapSearchItem struct {
	RefID       string `json:"ref_id"`
	Name        string `json:"name"`
	Address     string `json:"address"`
	FullAddress string `json:"full_address"`
	Display     string `json:"display"`
}

func (c *Client) vietmapSearch(ctx context.Context, text string) ([]vietmapSearchItem, error) {
	q := url.Values{}
	q.Set("apikey", c.vietmapKey)
	q.Set("text", text)
	q.Set("focus", "10.775658,106.700757")
	q.Set("display_type", "2")

	searchURL := "https://maps.vietmap.vn/api/search/v4?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vietmap search status %d", res.StatusCode)
	}

	var searchResults []vietmapSearchItem
	if err := json.NewDecoder(res.Body).Decode(&searchResults); err != nil {
		return nil, err
	}
	return searchResults, nil
}

func (c *Client) vietmapPlaceByRefID(ctx context.Context, refID string) (api.LatLng, error) {
	placeQ := url.Values{}
	placeQ.Set("apikey", c.vietmapKey)
	placeQ.Set("refid", refID)
	placeURL := "https://maps.vietmap.vn/api/place/v4?" + placeQ.Encode()

	req2, err := http.NewRequestWithContext(ctx, http.MethodGet, placeURL, nil)
	if err != nil {
		return api.LatLng{}, err
	}
	res2, err := c.http.Do(req2)
	if err != nil {
		return api.LatLng{}, err
	}
	defer res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		return api.LatLng{}, fmt.Errorf("vietmap place status %d", res2.StatusCode)
	}

	var place struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if err := json.NewDecoder(res2.Body).Decode(&place); err != nil {
		return api.LatLng{}, err
	}
	if place.Lat == 0 && place.Lng == 0 {
		return api.LatLng{}, fmt.Errorf("vietmap empty coords")
	}
	return api.LatLng{Lat: place.Lat, Lng: place.Lng}, nil
}

func (c *Client) searchOSM(ctx context.Context, text string, limit int) ([]Suggestion, error) {
	q := url.Values{}
	q.Set("format", "jsonv2")
	q.Set("q", text)
	q.Set("limit", strconv.Itoa(limit))
	q.Set("addressdetails", "1")
	q.Set("countrycodes", "vn")
	q.Set("dedupe", "1")

	reqURL := "https://nominatim.openstreetmap.org/search?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "vibemap/1.0")
	req.Header.Set("Accept-Language", "vi,en")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("osm search status %d", res.StatusCode)
	}

	var items []struct {
		PlaceID     int64  `json:"place_id"`
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
	}
	if err := json.NewDecoder(res.Body).Decode(&items); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("osm search no result")
	}

	out := make([]Suggestion, 0, limit)
	for _, item := range items {
		if len(out) >= limit {
			break
		}
		lat, err1 := strconv.ParseFloat(strings.TrimSpace(item.Lat), 64)
		lng, err2 := strconv.ParseFloat(strings.TrimSpace(item.Lon), 64)
		if err1 != nil || err2 != nil {
			continue
		}
		name := strings.TrimSpace(item.Name)
		display := strings.TrimSpace(item.DisplayName)
		if name == "" {
			if parts := strings.Split(display, ","); len(parts) > 0 {
				name = strings.TrimSpace(parts[0])
			}
		}
		if name == "" {
			name = text
		}

		out = append(out, Suggestion{
			RefID:    fmt.Sprintf("osm:%d", item.PlaceID),
			Name:     name,
			Address:  display,
			Location: api.LatLng{Lat: lat, Lng: lng},
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("osm search no result")
	}
	return out, nil
}
