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
	"vibemap/backend/internal/reviews"
	"vibemap/backend/internal/social"
)

func TestPlanRoute(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/pois.json")
	_ = poiRepo.Load()
	reviewRepo := reviews.NewRepository("../../data/data.json")
	_ = reviewRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, reviewRepo, socialStore)
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
	reviewRepo := reviews.NewRepository("../../data/data.json")
	_ = reviewRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, reviewRepo, socialStore)
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

func TestSocialParticipantsAndRecommendations(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/data.json")
	_ = poiRepo.Load()
	reviewRepo := reviews.NewRepository("../../data/data.json")
	_ = reviewRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, reviewRepo, socialStore)
	srv := httptest.NewServer(h.Router())
	t.Cleanup(srv.Close)

	joinBody := []byte(`{"displayName":"A"}`)
	res, err := http.Post(srv.URL+"/api/social/sessions/session_urban_pulse/join", "application/json", bytes.NewReader(joinBody))
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("join status: %d", res.StatusCode)
	}
	var joinResp struct {
		ParticipantId string `json:"participantId"`
		AvatarSeed    string `json:"avatarSeed"`
	}
	if err := json.NewDecoder(res.Body).Decode(&joinResp); err != nil {
		t.Fatalf("join decode: %v", err)
	}
	if joinResp.ParticipantId == "" || joinResp.AvatarSeed == "" {
		t.Fatalf("missing participantId/avatarSeed")
	}

	locPayload := []byte(`{"participantId":"` + joinResp.ParticipantId + `","lat":10.77,"lng":106.70}`)
	res2, err := http.Post(srv.URL+"/api/social/sessions/session_urban_pulse/location", "application/json", bytes.NewReader(locPayload))
	if err != nil {
		t.Fatalf("location: %v", err)
	}
	res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("location status: %d", res2.StatusCode)
	}

	res3, err := http.Get(srv.URL + "/api/social/sessions/session_urban_pulse/participants")
	if err != nil {
		t.Fatalf("participants: %v", err)
	}
	defer res3.Body.Close()
	if res3.StatusCode != http.StatusOK {
		t.Fatalf("participants status: %d", res3.StatusCode)
	}

	res4, err := http.Get(srv.URL + "/api/social/sessions/session_urban_pulse/recommendations")
	if err != nil {
		t.Fatalf("recs: %v", err)
	}
	defer res4.Body.Close()
	if res4.StatusCode != http.StatusOK {
		t.Fatalf("recs status: %d", res4.StatusCode)
	}
	var recs []api.Poi
	if err := json.NewDecoder(res4.Body).Decode(&recs); err != nil {
		t.Fatalf("recs decode: %v", err)
	}
	if len(recs) == 0 {
		t.Fatalf("expected recommendations")
	}
}

func TestCorsEchoOrigin(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/pois.json")
	_ = poiRepo.Load()
	reviewRepo := reviews.NewRepository("../../data/data.json")
	_ = reviewRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, reviewRepo, socialStore)
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.Header.Set("Origin", "http://localhost:5175")
	w := httptest.NewRecorder()
	h.Router().ServeHTTP(w, r)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected allow-origin header, got %q", got)
	}
}

func TestAssistantChatFallback(t *testing.T) {
	cfg := &config.Config{Port: "8080"}
	poiRepo := pois.NewRepository("../data/data.json")
	_ = poiRepo.Load()
	reviewRepo := reviews.NewRepository("../../data/data.json")
	_ = reviewRepo.Load()
	socialStore := social.NewStore()
	socialStore.SeedDefault()

	h := NewHandler(cfg, poiRepo, reviewRepo, socialStore)
	srv := httptest.NewServer(h.Router())
	t.Cleanup(srv.Close)

	body := []byte(`{"query":"I want a chill coffeeshop","topK":3}`)
	res, err := http.Post(srv.URL+"/api/assistant/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("assistant chat: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("assistant chat status: %d", res.StatusCode)
	}

	var resp struct {
		Reply        string `json:"reply"`
		UsedFallback bool   `json:"usedFallback"`
		Results      []struct {
			Poi struct {
				Name string `json:"name"`
			} `json:"poi"`
		} `json:"results"`
	}
	if err := json.NewDecoder(res.Body).Decode(&resp); err != nil {
		t.Fatalf("assistant chat decode: %v", err)
	}
	if resp.Reply == "" {
		t.Fatalf("expected reply")
	}
	if len(resp.Results) == 0 {
		t.Fatalf("expected assistant results")
	}
}
