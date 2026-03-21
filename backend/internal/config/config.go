package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port          string
	CorsOrigins   []string
	OrsAPIKey     string
	VietmapAPIKey string
	PoiDataPath   string
	UgcServiceURL string
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

	ugcServiceURL := strings.TrimSpace(os.Getenv("UGC_SERVICE_URL"))
	if ugcServiceURL == "" {
		ugcServiceURL = "http://localhost:8001"
	}

	cfg := &Config{
		Port:          port,
		CorsOrigins:   origins,
		OrsAPIKey:     strings.TrimSpace(os.Getenv("ORS_API_KEY")),
		VietmapAPIKey: strings.TrimSpace(os.Getenv("VIETMAP_API_KEY")),
		PoiDataPath:   poiPath,
		UgcServiceURL: ugcServiceURL,
	}

	if cfg.Port == "" {
		return nil, fmt.Errorf("PORT must not be empty")
	}
	return cfg, nil
}
