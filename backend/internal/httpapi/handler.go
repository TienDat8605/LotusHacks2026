package httpapi

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"

	"vibemap/backend/internal/api"
	"vibemap/backend/internal/config"
	"vibemap/backend/internal/pois"
	"vibemap/backend/internal/routes"
	"vibemap/backend/internal/social"
)

type Handler struct {
	cfg         *config.Config
	pois        *pois.Repository
	social      *social.Store
	streamMu    sync.Mutex
	streamRooms map[string]map[chan api.SocialEvent]struct{}
}

func NewHandler(cfg *config.Config, poiRepo *pois.Repository, socialStore *social.Store) *Handler {
	return &Handler{
		cfg:         cfg,
		pois:        poiRepo,
		social:      socialStore,
		streamRooms: map[string]map[chan api.SocialEvent]struct{}{},
	}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(h.corsMiddleware)
	r.Use(jsonMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	r.Get("/assets/*", h.handleAsset)

	r.Route("/api", func(apiR chi.Router) {
		apiR.Get("/geocode/search", h.handleGeocodeSearch)
		apiR.Post("/routes/plan", h.handlePlanRoute)
		apiR.Post("/routes/normal", h.handlePlanNormalRoute)
		apiR.Post("/routes/connect-pois", h.handleConnectPoisRoute)
		apiR.Post("/route", h.handlePlanRouteCompat)

		apiR.Handle("/ugc", http.HandlerFunc(h.handleUGCProxy))
		apiR.Handle("/ugc/*", http.HandlerFunc(h.handleUGCProxy))

		apiR.Get("/social/sessions", h.handleListSessions)
		apiR.Post("/social/sessions", h.handleCreateSession)
		apiR.Post("/social/sessions/join-by-code", h.handleJoinByCode)
		apiR.Get("/social/sessions/{sessionId}/stream", h.handleSessionStream)
		apiR.Post("/social/sessions/{sessionId}/join", h.handleJoinSession)
		apiR.Get("/social/sessions/{sessionId}/participants", h.handleListParticipants)
		apiR.Post("/social/sessions/{sessionId}/location", h.handleUpdateLocation)
		apiR.Get("/social/sessions/{sessionId}/recommendations", h.handleRecommendations)
		apiR.Get("/social/sessions/{sessionId}/messages", h.handleListMessages)
		apiR.Post("/social/sessions/{sessionId}/messages", h.handleSendMessage)
		apiR.Post("/social/sessions/{sessionId}/ping", h.handlePing)

		apiR.Get("/meetup/sessions", h.handleListSessions)
		apiR.Post("/meetup/sessions", h.handleCreateSession)
		apiR.Post("/meetup/sessions/join-by-code", h.handleJoinByCode)
		apiR.Get("/meetup/sessions/{sessionId}/stream", h.handleSessionStream)
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
		if strings.Contains(r.URL.Path, "/stream") || strings.HasPrefix(r.URL.Path, "/assets/") {
			next.ServeHTTP(w, r)
			return
		}
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

func (h *Handler) handlePlanNormalRoute(w http.ResponseWriter, r *http.Request) {
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
	plan, err := svc.PlanNormal(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ROUTE_FAILED", "Could not plan normal route")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (h *Handler) handleConnectPoisRoute(w http.ResponseWriter, r *http.Request) {
	var req api.ConnectPoisRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Origin) == "" || len(req.PoiIDs) == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "origin and poiIds are required")
		return
	}

	svc := routes.NewService(h.pois.List(), h.cfg.OrsAPIKey, h.cfg.VietmapAPIKey)
	plan, err := svc.ConnectPois(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ROUTE_FAILED", "Could not connect suggested places")
		return
	}
	if len(plan.Pois) == 0 {
		writeError(w, http.StatusBadRequest, "ROUTE_FAILED", "No valid POIs were provided")
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

func (h *Handler) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DestinationName string `json:"destinationName"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	session := h.social.CreateSession(body.DestinationName)
	writeJSON(w, http.StatusCreated, session)
}

func (h *Handler) handleJoinByCode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code        string `json:"code"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid JSON body")
		return
	}
	session, ok := h.social.FindSessionByCode(body.Code)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session code not found")
		return
	}
	participant, ok := h.social.Join(session.ID, body.DisplayName)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	h.broadcastSessionSnapshot(session.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"session":       session,
		"participantId": participant.ID,
		"avatarSeed":    participant.AvatarSeed,
	})
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
	h.broadcastSessionSnapshot(sessionID)
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
	participant, ok := h.social.UpdateLocation(sessionID, body.ParticipantId, body.Lat, body.Lng)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Participant not found")
		return
	}
	h.broadcastSessionSnapshot(sessionID)
	writeJSON(w, http.StatusOK, participant)
}

func (h *Handler) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	participants, ok := h.social.ListParticipants(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	pois := rankPoisForParticipants(h.pois.List(), participants, 3)
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
	h.broadcastEvent(sessionID, api.SocialEvent{Type: "message", Message: &msg})
	writeJSON(w, http.StatusOK, msg)
}

func (h *Handler) handlePing(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if !h.social.Ping(sessionID) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	h.broadcastSessionSnapshot(sessionID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) handleSessionStream(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if _, ok := h.social.ListParticipants(sessionID); !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "STREAM_UNAVAILABLE", "Streaming is not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan api.SocialEvent, 8)
	h.addStreamListener(sessionID, ch)
	defer h.removeStreamListener(sessionID, ch)

	writer := bufio.NewWriter(w)
	h.writeStreamEvent(writer, api.SocialEvent{Type: "snapshot", Session: h.sessionPtr(sessionID), Participants: h.mustParticipants(sessionID), Messages: h.mustMessages(sessionID), Recommendations: h.mustRecommendations(sessionID)})
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-ch:
			h.writeStreamEvent(writer, event)
			flusher.Flush()
		}
	}
}

func (h *Handler) writeStreamEvent(writer *bufio.Writer, event api.SocialEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}
	encoded := base64.StdEncoding.EncodeToString(payload)
	_, _ = writer.WriteString("data: " + encoded + "\n\n")
	_ = writer.Flush()
}

func (h *Handler) addStreamListener(sessionID string, ch chan api.SocialEvent) {
	h.streamMu.Lock()
	defer h.streamMu.Unlock()
	if h.streamRooms[sessionID] == nil {
		h.streamRooms[sessionID] = map[chan api.SocialEvent]struct{}{}
	}
	h.streamRooms[sessionID][ch] = struct{}{}
}

func (h *Handler) removeStreamListener(sessionID string, ch chan api.SocialEvent) {
	h.streamMu.Lock()
	defer h.streamMu.Unlock()
	listeners := h.streamRooms[sessionID]
	if listeners == nil {
		return
	}
	delete(listeners, ch)
	close(ch)
	if len(listeners) == 0 {
		delete(h.streamRooms, sessionID)
	}
}

func (h *Handler) broadcastEvent(sessionID string, event api.SocialEvent) {
	h.streamMu.Lock()
	listeners := h.streamRooms[sessionID]
	channels := make([]chan api.SocialEvent, 0, len(listeners))
	for ch := range listeners {
		channels = append(channels, ch)
	}
	h.streamMu.Unlock()
	for _, ch := range channels {
		select {
		case ch <- event:
		default:
		}
	}
}

func (h *Handler) broadcastSessionSnapshot(sessionID string) {
	h.broadcastEvent(sessionID, api.SocialEvent{
		Type:            "snapshot",
		Session:         h.sessionPtr(sessionID),
		Participants:    h.mustParticipants(sessionID),
		Messages:        h.mustMessages(sessionID),
		Recommendations: h.mustRecommendations(sessionID),
	})
}

func (h *Handler) sessionPtr(sessionID string) *api.SocialSession {
	for _, session := range h.social.ListSessions() {
		if session.ID == sessionID {
			copy := session
			return &copy
		}
	}
	return nil
}

func (h *Handler) mustParticipants(sessionID string) []api.SocialParticipant {
	participants, _ := h.social.ListParticipants(sessionID)
	return participants
}

func (h *Handler) mustMessages(sessionID string) []api.ChatMessage {
	messages, _ := h.social.ListMessages(sessionID)
	return messages
}

func (h *Handler) mustRecommendations(sessionID string) []api.Poi {
	participants, _ := h.social.ListParticipants(sessionID)
	return rankPoisForParticipants(h.pois.List(), participants, 3)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
