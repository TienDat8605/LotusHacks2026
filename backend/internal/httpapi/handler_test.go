package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"vibemap/backend/internal/api"
	"vibemap/backend/internal/config"
	"vibemap/backend/internal/pois"
	"vibemap/backend/internal/social"
)

func TestPlanRoute(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/pois.json")
	_ = poiRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, socialStore)
	srv := httptest.NewServer(h.Router())
	t.Cleanup(srv.Close)

	body, _ := json.Marshal(api.RoutePlanRequest{
		Origin:            "Ben Thanh",
		Destination:       "D1",
		TimeBudgetMinutes: 120,
		TransportMode:     api.TransportModeBike,
		IncludeTrending:   true,
	})

	res, err := http.Post(srv.URL+"/api/routes/plan", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", res.StatusCode)
	}

	var plan api.RoutePlan
	if err := json.NewDecoder(res.Body).Decode(&plan); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if plan.ID == "" || plan.Title == "" {
		t.Fatalf("missing id/title")
	}
	if len(plan.Pois) == 0 {
		t.Fatalf("expected pois")
	}
}

func TestSocialSessions(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/pois.json")
	_ = poiRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, socialStore)
	srv := httptest.NewServer(h.Router())
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/api/social/sessions")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", res.StatusCode)
	}
}

