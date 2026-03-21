package social

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"strings"
	"sync"
	"time"

	"vibemap/backend/internal/api"
)

type Store struct {
	mu           sync.RWMutex
	sessions     map[string]*api.SocialSession
	messages     map[string][]api.ChatMessage
	participants map[string]map[string]*api.SocialParticipant
}

func NewStore() *Store {
	return &Store{
		sessions:     map[string]*api.SocialSession{},
		messages:     map[string][]api.ChatMessage{},
		participants: map[string]map[string]*api.SocialParticipant{},
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

	s.participants["session_urban_pulse"] = map[string]*api.SocialParticipant{}
	s.participants["session_rooftop"] = map[string]*api.SocialParticipant{}
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

func (s *Store) Join(sessionID string, displayName string) (api.SocialParticipant, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return api.SocialParticipant{}, false
	}
	sess.ParticipantCount++
	if strings.TrimSpace(displayName) == "" {
		displayName = "Explorer"
	}
	pid := newID("participant")
	p := &api.SocialParticipant{
		ID:          pid,
		DisplayName: displayName,
		AvatarSeed:  newID("avatar"),
		LastSeen:    time.Now().UTC().Format(time.RFC3339),
	}
	if s.participants[sessionID] == nil {
		s.participants[sessionID] = map[string]*api.SocialParticipant{}
	}
	s.participants[sessionID][pid] = p
	return *p, true
}

func (s *Store) UpdateLocation(sessionID, participantID string, lat, lng float64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	room, ok := s.participants[sessionID]
	if !ok {
		return false
	}
	p, ok := room[participantID]
	if !ok {
		return false
	}
	p.Lat = &lat
	p.Lng = &lng
	p.LastSeen = time.Now().UTC().Format(time.RFC3339)
	return true
}

func (s *Store) ListParticipants(sessionID string) ([]api.SocialParticipant, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.sessions[sessionID]; !ok {
		return nil, false
	}
	room := s.participants[sessionID]
	out := make([]api.SocialParticipant, 0, len(room))
	for _, p := range room {
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen > out[j].LastSeen })
	return out, true
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
