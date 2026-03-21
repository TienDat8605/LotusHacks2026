package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"vibemap/backend/internal/geocode"
)

func (h *Handler) handleGeocodeSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, []geocode.Suggestion{})
		return
	}

	limit := 5
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 10 {
		limit = 10
	}

	client := geocode.NewClient("", h.cfg.VietmapAPIKey)
	results, err := client.Search(r.Context(), query, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, "GEOCODE_FAILED", "Could not search locations")
		return
	}
	writeJSON(w, http.StatusOK, results)
}
