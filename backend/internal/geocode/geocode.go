package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"vibemap/backend/internal/api"
)

type Client struct {
	orsKey     string
	vietmapKey string
	http       *http.Client
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
	q := url.Values{}
	q.Set("apikey", c.vietmapKey)
	q.Set("text", text)
	q.Set("focus", "10.775658,106.700757")
	q.Set("display_type", "2")

	searchURL := "https://maps.vietmap.vn/api/search/v4?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return api.LatLng{}, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return api.LatLng{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return api.LatLng{}, fmt.Errorf("vietmap search status %d", res.StatusCode)
	}

	var searchResults []struct {
		RefID string `json:"ref_id"`
	}
	if err := json.NewDecoder(res.Body).Decode(&searchResults); err != nil {
		return api.LatLng{}, err
	}
	if len(searchResults) == 0 || strings.TrimSpace(searchResults[0].RefID) == "" {
		return api.LatLng{}, fmt.Errorf("vietmap search no result")
	}

	placeQ := url.Values{}
	placeQ.Set("apikey", c.vietmapKey)
	placeQ.Set("refid", searchResults[0].RefID)
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
