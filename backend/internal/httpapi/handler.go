package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"vibemap/backend/internal/api"
	"vibemap/backend/internal/assistant"
	"vibemap/backend/internal/config"
	"vibemap/backend/internal/pois"
	"vibemap/backend/internal/reviews"
	"vibemap/backend/internal/routes"
	"vibemap/backend/internal/social"
)

type Handler struct {
	cfg       *config.Config
	pois      *pois.Repository
	reviews   *reviews.Repository
	assistant *assistant.Service
	social    *social.Store
}

func NewHandler(cfg *config.Config, poiRepo *pois.Repository, reviewRepo *reviews.Repository, socialStore *social.Store) *Handler {
	var assistantSvc *assistant.Service
	if reviewRepo != nil {
		assistantSvc = assistant.NewService(cfg, reviewRepo.List())
	}

	return &Handler{
		cfg:       cfg,
		pois:      poiRepo,
		reviews:   reviewRepo,
		assistant: assistantSvc,
		social:    socialStore,
	}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(h.corsMiddleware)
	r.Use(jsonMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	r.Route("/api", func(apiR chi.Router) {
		apiR.Post("/routes/plan", h.handlePlanRoute)
		apiR.Post("/route", h.handlePlanRouteCompat)
		apiR.Post("/assistant/chat", h.handleAssistantChat)

		apiR.Get("/social/sessions", h.handleListSessions)
		apiR.Post("/social/sessions/{sessionId}/join", h.handleJoinSession)
		apiR.Get("/social/sessions/{sessionId}/participants", h.handleListParticipants)
		apiR.Post("/social/sessions/{sessionId}/location", h.handleUpdateLocation)
		apiR.Get("/social/sessions/{sessionId}/recommendations", h.handleRecommendations)
		apiR.Get("/social/sessions/{sessionId}/messages", h.handleListMessages)
		apiR.Post("/social/sessions/{sessionId}/messages", h.handleSendMessage)
		apiR.Post("/social/sessions/{sessionId}/ping", h.handlePing)

		apiR.Get("/meetup/sessions", h.handleListSessions)
		apiR.Post("/meetup/sessions/{sessionId}/join", h.handleJoinSession)
		apiR.Get("/meetup/sessions/{sessionId}/participants", h.handleListParticipants)
		apiR.Post("/meetup/sessions/{sessionId}/location", h.handleUpdateLocation)
		apiR.Get("/meetup/sessions/{sessionId}/recommendations", h.handleRecommendations)
		apiR.Get("/meetup/sessions/{sessionId}/messages", h.handleListMessages)
		apiR.Post("/meetup/sessions/{sessionId}/messages", h.handleSendMessage)
		apiR.Post("/meetup/sessions/{sessionId}/ping", h.handlePing)
	})

	return r
}

func (h *Handler) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

		if len(h.cfg.CorsOrigins) != 0 {
			origin := r.Header.Get("Origin")
			if origin != "" {
				allowed := false
				for _, o := range h.cfg.CorsOrigins {
					if o == origin {
						allowed = true
						break
					}
				}
				if allowed {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Vary", "Origin")
				}
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) handlePlanRoute(w http.ResponseWriter, r *http.Request) {
	var req api.RoutePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Origin) == "" || strings.TrimSpace(req.Destination) == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "origin and destination are required")
		return
	}

	svc := routes.NewService(h.pois.List(), h.cfg.OrsAPIKey, h.cfg.VietmapAPIKey)
	plan, err := svc.Plan(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ROUTE_FAILED", "Could not plan route")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

type compatRouteRequest struct {
	Origin            string `json:"origin"`
	Destination       string `json:"destination"`
	TimeBudgetMinutes int    `json:"time_budget_minutes"`
	TransportMode     string `json:"transport_mode"`
}

func (h *Handler) handlePlanRouteCompat(w http.ResponseWriter, r *http.Request) {
	var body compatRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	req := api.RoutePlanRequest{
		Origin:            body.Origin,
		Destination:       body.Destination,
		TimeBudgetMinutes: body.TimeBudgetMinutes,
		TransportMode:     api.TransportMode(strings.TrimSpace(body.TransportMode)),
		IncludeTrending:   false,
	}
	if strings.TrimSpace(req.Origin) == "" || strings.TrimSpace(req.Destination) == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "origin and destination are required")
		return
	}

	svc := routes.NewService(h.pois.List(), h.cfg.OrsAPIKey, h.cfg.VietmapAPIKey)
	plan, err := svc.Plan(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ROUTE_FAILED", "Could not plan route")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (h *Handler) handleListSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.social.ListSessions())
}

func (h *Handler) handleJoinSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	var body struct {
		DisplayName string `json:"displayName"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	participant, ok := h.social.Join(sessionID, body.DisplayName)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"participantId": participant.ID, "avatarSeed": participant.AvatarSeed})
}

func (h *Handler) handleListParticipants(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	participants, ok := h.social.ListParticipants(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, participants)
}

func (h *Handler) handleUpdateLocation(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	var body struct {
		ParticipantId string  `json:"participantId"`
		Lat           float64 `json:"lat"`
		Lng           float64 `json:"lng"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	if strings.TrimSpace(body.ParticipantId) == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "participantId is required")
		return
	}
	if ok := h.social.UpdateLocation(sessionID, body.ParticipantId, body.Lat, body.Lng); !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Participant not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	participants, ok := h.social.ListParticipants(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	pois := rankPoisForParticipants(h.pois.List(), participants, 5)
	writeJSON(w, http.StatusOK, pois)
}

func (h *Handler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	msgs, ok := h.social.ListMessages(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (h *Handler) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "text is required")
		return
	}
	msg, ok := h.social.AddMessage(sessionID, "user", body.Text)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, msg)
}

func (h *Handler) handlePing(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if !h.social.Ping(sessionID) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) handleAssistantChat(w http.ResponseWriter, r *http.Request) {
	if h.assistant == nil || !h.assistant.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "ASSISTANT_UNAVAILABLE", "Review assistant is not configured")
		return
	}

	var req api.AssistantChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	req.Query = strings.TrimSpace(req.Query)
	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "query is required")
		return
	}

	resp, err := h.assistant.Chat(r.Context(), req.Query, req.TopK)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ASSISTANT_FAILED", "Could not answer query")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
