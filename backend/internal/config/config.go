package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port                     string
	CorsOrigins              []string
	OrsAPIKey                string
	VietmapAPIKey            string
	OpenAIAPIKey             string
	OpenAIChatModel          string
	OpenAIEmbeddingModel     string
	PoiDataPath              string
	ReviewDataPath           string
	ReviewEmbeddingCachePath string
}

func Load() (*Config, error) {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	rawOrigins := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))
	var origins []string
	if rawOrigins != "" {
		for _, part := range strings.Split(rawOrigins, ",") {
			o := strings.TrimSpace(part)
			if o != "" {
				origins = append(origins, o)
			}
		}
	}

	poiPath := strings.TrimSpace(os.Getenv("POI_DATA_PATH"))
	if poiPath == "" {
		poiPath = "../data/data.json"
	}

	reviewPath := strings.TrimSpace(os.Getenv("REVIEW_DATA_PATH"))
	if reviewPath == "" {
		reviewPath = poiPath
	}

	reviewCachePath := strings.TrimSpace(os.Getenv("REVIEW_EMBEDDING_CACHE_PATH"))
	if reviewCachePath == "" {
		reviewCachePath = "../data/review-embeddings-cache.json"
	}

	chatModel := strings.TrimSpace(os.Getenv("OPENAI_CHAT_MODEL"))
	if chatModel == "" {
		chatModel = "gpt-4o-mini"
	}

	embeddingModel := strings.TrimSpace(os.Getenv("OPENAI_EMBEDDING_MODEL"))
	if embeddingModel == "" {
		embeddingModel = "text-embedding-3-small"
	}

	cfg := &Config{
		Port:                     port,
		CorsOrigins:              origins,
		OrsAPIKey:                strings.TrimSpace(os.Getenv("ORS_API_KEY")),
		VietmapAPIKey:            strings.TrimSpace(os.Getenv("VIETMAP_API_KEY")),
		OpenAIAPIKey:             strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		OpenAIChatModel:          chatModel,
		OpenAIEmbeddingModel:     embeddingModel,
		PoiDataPath:              poiPath,
		ReviewDataPath:           reviewPath,
		ReviewEmbeddingCachePath: reviewCachePath,
	}

	if cfg.Port == "" {
		return nil, fmt.Errorf("PORT must not be empty")
	}
	return cfg, nil
}
