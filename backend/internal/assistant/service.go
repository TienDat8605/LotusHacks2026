package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"vibemap/backend/internal/api"
	"vibemap/backend/internal/config"
	"vibemap/backend/internal/openai"
	"vibemap/backend/internal/reviews"
)

type Service struct {
	client         *openai.Client
	chatModel      string
	embeddingModel string
	cachePath      string

	mu              sync.RWMutex
	docs            []indexedDoc
	embeddings      bool
	embeddingsTried bool
}

type indexedDoc struct {
	Doc       reviews.Document
	Embedding []float64
	Tokens    map[string]float64
}

type SearchResult struct {
	Poi      api.Poi `json:"poi"`
	Summary  string  `json:"summary"`
	Evidence string  `json:"evidence,omitempty"`
	Score    float64 `json:"score"`
}

type ChatResponse struct {
	Reply        string         `json:"reply"`
	Results      []SearchResult `json:"results"`
	UsedFallback bool           `json:"usedFallback"`
}

func NewService(cfg *config.Config, docs []reviews.Document) *Service {
	indexed := make([]indexedDoc, 0, len(docs))
	for _, doc := range docs {
		indexed = append(indexed, indexedDoc{
			Doc:    doc,
			Tokens: tokenWeights(doc.SearchText),
		})
	}

	return &Service{
		client:         openai.NewClient(cfg.OpenAIAPIKey),
		chatModel:      cfg.OpenAIChatModel,
		embeddingModel: cfg.OpenAIEmbeddingModel,
		cachePath:      cfg.ReviewEmbeddingCachePath,
		docs:           indexed,
	}
}

func (s *Service) Enabled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.docs) > 0
}

func (s *Service) Chat(ctx context.Context, query string, topK int) (ChatResponse, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return ChatResponse{}, fmt.Errorf("query is required")
	}
	if topK <= 0 {
		topK = 5
	}
	if topK > 8 {
		topK = 8
	}

	queryEmbedding, _ := s.ensureQueryEmbedding(ctx, query)
	results := s.search(query, queryEmbedding, topK)
	reply, err := s.generateReply(ctx, query, results)
	if err != nil {
		return ChatResponse{
			Reply:        fallbackReply(query, results),
			Results:      results,
			UsedFallback: true,
		}, nil
	}

	return ChatResponse{
		Reply:        reply,
		Results:      results,
		UsedFallback: false,
	}, nil
}

func (s *Service) ensureQueryEmbedding(ctx context.Context, query string) ([]float64, error) {
	if !s.client.Enabled() {
		return nil, fmt.Errorf("openai disabled")
	}
	_ = s.ensureDocumentEmbeddings(ctx)
	return s.client.CreateEmbedding(ctx, s.embeddingModel, query)
}

func (s *Service) ensureDocumentEmbeddings(ctx context.Context) error {
	s.mu.RLock()
	if s.embeddings || s.embeddingsTried {
		s.mu.RUnlock()
		return nil
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.embeddings || s.embeddingsTried {
		return nil
	}
	s.embeddingsTried = true

	if !s.client.Enabled() {
		return fmt.Errorf("openai disabled")
	}
	if cache, err := s.loadCache(); err == nil {
		for i := range s.docs {
			if emb, ok := cache[s.docs[i].Doc.ID]; ok {
				s.docs[i].Embedding = emb
			}
		}
		if s.haveAllEmbeddingsLocked() {
			s.embeddings = true
			return nil
		}
	}

	cache := map[string][]float64{}
	for i := range s.docs {
		emb, err := s.client.CreateEmbedding(ctx, s.embeddingModel, s.docs[i].Doc.SearchText)
		if err != nil {
			return err
		}
		s.docs[i].Embedding = emb
		cache[s.docs[i].Doc.ID] = emb
	}
	s.embeddings = true
	_ = s.saveCache(cache)
	return nil
}

func (s *Service) haveAllEmbeddingsLocked() bool {
	for _, doc := range s.docs {
		if len(doc.Embedding) == 0 {
			return false
		}
	}
	return len(s.docs) > 0
}

func (s *Service) loadCache() (map[string][]float64, error) {
	if strings.TrimSpace(s.cachePath) == "" {
		return nil, fmt.Errorf("cache path not configured")
	}
	raw, err := os.ReadFile(s.cachePath)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Model      string               `json:"model"`
		Embeddings map[string][]float64 `json:"embeddings"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	if parsed.Model != s.embeddingModel {
		return nil, fmt.Errorf("embedding model mismatch")
	}
	return parsed.Embeddings, nil
}

func (s *Service) saveCache(cache map[string][]float64) error {
	if strings.TrimSpace(s.cachePath) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.cachePath), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(struct {
		Model      string               `json:"model"`
		Embeddings map[string][]float64 `json:"embeddings"`
	}{
		Model:      s.embeddingModel,
		Embeddings: cache,
	}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.cachePath, raw, 0o644)
}

func (s *Service) search(query string, queryEmbedding []float64, topK int) []SearchResult {
	s.mu.RLock()
	docs := make([]indexedDoc, len(s.docs))
	copy(docs, s.docs)
	s.mu.RUnlock()

	queryTokens := tokenWeights(query)
	scored := make([]SearchResult, 0, len(docs))
	for _, doc := range docs {
		lexical := overlapScore(queryTokens, doc.Tokens)
		semantic := 0.0
		if len(queryEmbedding) > 0 && len(doc.Embedding) == len(queryEmbedding) {
			semantic = cosineSimilarity(queryEmbedding, doc.Embedding)
		}
		score := lexical
		if semantic > 0 {
			score = lexical*0.35 + semantic*0.65
		}
		if score <= 0 {
			continue
		}

		scored = append(scored, SearchResult{
			Poi:      doc.Doc.Poi,
			Summary:  doc.Doc.Summary,
			Evidence: doc.Doc.Evidence,
			Score:    score,
		})
	}

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		return scored[i].Poi.ID < scored[j].Poi.ID
	})

	if len(scored) == 0 {
		return genericTopResults(docs, topK)
	}
	if len(scored) > topK {
		scored = scored[:topK]
	}
	return scored
}

func genericTopResults(docs []indexedDoc, topK int) []SearchResult {
	if len(docs) > topK {
		docs = docs[:topK]
	}
	out := make([]SearchResult, 0, len(docs))
	for _, doc := range docs {
		out = append(out, SearchResult{
			Poi:      doc.Doc.Poi,
			Summary:  doc.Doc.Summary,
			Evidence: doc.Doc.Evidence,
			Score:    0,
		})
	}
	return out
}

func (s *Service) generateReply(ctx context.Context, query string, results []SearchResult) (string, error) {
	if !s.client.Enabled() {
		return "", fmt.Errorf("openai disabled")
	}

	var contextLines []string
	for i, result := range results {
		line := fmt.Sprintf("%d. %s", i+1, result.Poi.Name)
		if result.Poi.Address != nil && strings.TrimSpace(*result.Poi.Address) != "" {
			line += " | address: " + strings.TrimSpace(*result.Poi.Address)
		}
		if result.Summary != "" {
			line += " | review: " + strings.TrimSpace(result.Summary)
		}
		contextLines = append(contextLines, line)
	}

	systemPrompt := "You are a local venue recommendation assistant. Use only the provided venue context. Be honest about uncertainty. Recommend 2-4 places, explain why each matches the request, and mention concrete details from the review snippets. If the matches are weak, say so."
	userPrompt := "User request: " + query + "\n\nRetrieved places:\n" + strings.Join(contextLines, "\n")
	return s.client.CreateChatCompletion(ctx, s.chatModel, systemPrompt, userPrompt)
}

func fallbackReply(query string, results []SearchResult) string {
	if len(results) == 0 {
		return "I couldn't find a strong match in the current review set for that request yet."
	}

	lines := []string{
		fmt.Sprintf("Based on the review data, these look like the closest matches for \"%s\":", query),
	}
	for _, result := range results {
		line := "- " + result.Poi.Name
		if result.Summary != "" {
			line += ": " + trimSentence(result.Summary, 160)
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func trimSentence(v string, limit int) string {
	v = strings.TrimSpace(v)
	if len(v) <= limit {
		return v
	}
	return strings.TrimSpace(v[:limit-3]) + "..."
}

func tokenWeights(v string) map[string]float64 {
	fields := strings.FieldsFunc(strings.ToLower(v), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	out := map[string]float64{}
	for _, field := range fields {
		if len(field) < 2 {
			continue
		}
		out[field] += 1
	}
	return out
}

func overlapScore(a, b map[string]float64) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	score := 0.0
	normA := 0.0
	normB := 0.0
	for token, av := range a {
		normA += av * av
		if bv, ok := b[token]; ok {
			score += av * bv
		}
	}
	for _, bv := range b {
		normB += bv * bv
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return score / (math.Sqrt(normA) * math.Sqrt(normB))
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	dot := 0.0
	normA := 0.0
	normB := 0.0
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}
