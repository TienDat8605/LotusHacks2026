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
	codes        map[string]string
}

func NewStore() *Store {
	return &Store{
		sessions:     map[string]*api.SocialSession{},
		messages:     map[string][]api.ChatMessage{},
		participants: map[string]map[string]*api.SocialParticipant{},
		codes:        map[string]string{},
	}
}

func (s *Store) SeedDefault() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seedSession("session_urban_pulse", "Pasteur Street Brewing Co.", "live", "URBAN1")
	s.seedSession("session_rooftop", "Twilight Rooftop", "scheduled", "ROOF22")
	s.messages["session_urban_pulse"] = []api.ChatMessage{
		{ID: newID("m"), Role: "assistant", Text: "Welcome to Urban Pulse. Drop your ETA and I’ll keep the vibe aligned.", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
	}
}

func (s *Store) seedSession(id, destinationName, status, code string) {
	s.sessions[id] = &api.SocialSession{
		ID:               id,
		DestinationName:  destinationName,
		ParticipantCount: 0,
		Status:           status,
		Code:             code,
	}
	s.codes[strings.ToUpper(code)] = id
	s.participants[id] = map[string]*api.SocialParticipant{}
}

func (s *Store) ListSessions() []api.SocialSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]api.SocialSession, 0, len(s.sessions))
	for _, v := range s.sessions {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Status == out[j].Status {
			return out[i].DestinationName < out[j].DestinationName
		}
		return out[i].Status < out[j].Status
	})
	return out
}

func (s *Store) CreateSession(destinationName string) api.SocialSession {
	s.mu.Lock()
	defer s.mu.Unlock()
	name := strings.TrimSpace(destinationName)
	if name == "" {
		name = "New Meetup Room"
	}
	sessionID := newID("session")
	code := s.newRoomCodeLocked()
	s.sessions[sessionID] = &api.SocialSession{
		ID:               sessionID,
		DestinationName:  name,
		ParticipantCount: 0,
		Status:           "live",
		Code:             code,
	}
	s.participants[sessionID] = map[string]*api.SocialParticipant{}
	s.messages[sessionID] = []api.ChatMessage{
		{ID: newID("m"), Role: "assistant", Text: "Room created. Share the code so others can join the meetup.", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
	}
	s.codes[code] = sessionID
	return *s.sessions[sessionID]
}

func (s *Store) FindSessionByCode(code string) (api.SocialSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sessionID, ok := s.codes[strings.ToUpper(strings.TrimSpace(code))]
	if !ok {
		return api.SocialSession{}, false
	}
	session, ok := s.sessions[sessionID]
	if !ok {
		return api.SocialSession{}, false
	}
	return *session, true
}

func (s *Store) Join(sessionID string, displayName string) (api.SocialParticipant, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[sessionID]
	if !ok {
		return api.SocialParticipant{}, false
	}
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
	sess.ParticipantCount = len(s.participants[sessionID])
	return *p, true
}

func (s *Store) UpdateLocation(sessionID, participantID string, lat, lng float64) (api.SocialParticipant, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	room, ok := s.participants[sessionID]
	if !ok {
		return api.SocialParticipant{}, false
	}
	p, ok := room[participantID]
	if !ok {
		return api.SocialParticipant{}, false
	}
	p.Lat = &lat
	p.Lng = &lng
	p.LastSeen = time.Now().UTC().Format(time.RFC3339)
	return *p, true
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

func (s *Store) AddMessage(sessionID, role, text string) (api.ChatMessage, bool) {
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

func (s *Store) newRoomCodeLocked() string {
	for {
		code := strings.ToUpper(randomAlphaNumeric(6))
		if code == "" {
			code = strings.ToUpper(time.Now().UTC().Format("150405"))
		}
		if _, exists := s.codes[code]; !exists {
			return code
		}
	}
}

func randomAlphaNumeric(length int) string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	if length <= 0 {
		return ""
	}
	bytes := make([]byte, length)
	raw := make([]byte, length)
	if _, err := rand.Read(raw); err != nil {
		return ""
	}
	for i := range bytes {
		bytes[i] = alphabet[int(raw[i])%len(alphabet)]
	}
	return string(bytes)
}

func newID(prefix string) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return prefix + "_" + time.Now().UTC().Format("20060102150405")
	}
	return prefix + "_" + hex.EncodeToString(b)
}
