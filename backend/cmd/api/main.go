package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vibemap/backend/internal/config"
	"vibemap/backend/internal/httpapi"
	"vibemap/backend/internal/pois"
	"vibemap/backend/internal/social"
)

func main() {
	if err := config.LoadDotEnv(".env"); err != nil {
		log.Printf("WARN: load .env: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	poiRepo := pois.NewRepository(cfg.PoiDataPath)
	if err := poiRepo.Load(); err != nil {
		log.Printf("WARN: POI data load failed: %v", err)
	}

	socialStore := social.NewStore()
	socialStore.SeedDefault()

	handler := httpapi.NewHandler(cfg, poiRepo, socialStore)
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("backend listening on http://localhost:%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
