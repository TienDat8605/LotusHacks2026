package social

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"vibemap/backend/internal/api"
)

type Store struct {
	mu       sync.RWMutex
	sessions map[string]*api.SocialSession
	messages map[string][]api.ChatMessage
}

func NewStore() *Store {
	return &Store{
		sessions: map[string]*api.SocialSession{},
		messages: map[string][]api.ChatMessage{},
	}
}

func (s *Store) SeedDefault() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions["session_urban_pulse"] = &api.SocialSession{
		ID:               "session_urban_pulse",
		DestinationName:  "Pasteur Street Brewing Co.",
		ParticipantCount: 12,
		Status:           "live",
	}
	s.sessions["session_rooftop"] = &api.SocialSession{
		ID:               "session_rooftop",
		DestinationName:  "Twilight Rooftop",
		ParticipantCount: 6,
		Status:           "scheduled",
	}
	s.messages["session_urban_pulse"] = []api.ChatMessage{
		{ID: newID("m"), Role: "assistant", Text: "Welcome to Urban Pulse. Drop your ETA and I’ll keep the vibe aligned.", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: newID("m"), Role: "user", Text: "On my way — 10 mins.", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
	}
}

func (s *Store) ListSessions() []api.SocialSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]api.SocialSession, 0, len(s.sessions))
	for _, v := range s.sessions {
		out = append(out, *v)
	}
	return out
}

func (s *Store) Join(sessionID string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return "", false
	}
	sess.ParticipantCount++
	return newID("participant"), true
}

func (s *Store) ListMessages(sessionID string) ([]api.ChatMessage, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.sessions[sessionID]; !ok {
		return nil, false
	}
	msgs := s.messages[sessionID]
	out := make([]api.ChatMessage, len(msgs))
	copy(out, msgs)
	return out, true
}

func (s *Store) AddMessage(sessionID string, role, text string) (api.ChatMessage, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sessions[sessionID]; !ok {
		return api.ChatMessage{}, false
	}
	msg := api.ChatMessage{
		ID:        newID("m"),
		Role:      role,
		Text:      text,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	s.messages[sessionID] = append(s.messages[sessionID], msg)
	return msg, true
}

func (s *Store) Ping(sessionID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.sessions[sessionID]
	return ok
}

func newID(prefix string) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return prefix + "_" + time.Now().UTC().Format("20060102150405")
	}
	return prefix + "_" + hex.EncodeToString(b)
}
