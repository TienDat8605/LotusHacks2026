package httpapi

import (
	"net/http"
	"net/http/httputil"
	"net/url"
)

func (h *Handler) handleUGCProxy(w http.ResponseWriter, r *http.Request) {
	target, err := url.Parse(h.cfg.UgcServiceURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "CONFIG_ERROR", "Invalid UGC_SERVICE_URL")
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, _ error) {
		writeError(w, http.StatusBadGateway, "UPSTREAM_ERROR", "UGC service unavailable")
	}

	proxy.ServeHTTP(w, r)
}

