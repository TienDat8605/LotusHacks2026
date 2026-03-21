package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) handleAsset(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(chi.URLParam(r, "*"))
	if raw == "" {
		http.NotFound(w, r)
		return
	}

	normalized := strings.ReplaceAll(raw, "\\", "/")
	normalized = strings.TrimPrefix(normalized, "/")
	normalized = strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+normalized)), "/")
	if normalized == "" || normalized == "." || !strings.HasPrefix(normalized, "images/") {
		http.NotFound(w, r)
		return
	}

	dataPath := strings.TrimSpace(h.cfg.PoiDataPath)
	if dataPath == "" {
		dataPath = "../data/data.json"
	}
	dataDir := filepath.Dir(dataPath)

	targetPath := filepath.Join(dataDir, filepath.FromSlash(normalized))
	absDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	absTargetPath, err := filepath.Abs(targetPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	rel, err := filepath.Rel(absDataDir, absTargetPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		http.NotFound(w, r)
		return
	}

	info, err := os.Stat(absTargetPath)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, absTargetPath)
}
