package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const quoteCacheTTL = 10 * time.Minute

func (s *Server) getQuote(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))
	if symbol == "" {
		writeError(w, http.StatusBadRequest, "symbol required")
		return
	}

	// Check cache
	if s.cache != nil {
		if cached, _ := s.cache.GetQuote(r.Context(), symbol); cached != nil {
			writeJSON(w, http.StatusOK, cached)
			return
		}
	}

	if s.asxQuote == nil {
		writeError(w, http.StatusServiceUnavailable, "quote service unavailable")
		return
	}

	quote, err := s.asxQuote.FetchQuote(r.Context(), symbol)
	if err != nil {
		log.Printf("ASX quote fetch error for %s: %v", symbol, err)
		writeError(w, http.StatusBadGateway, "failed to fetch quote")
		return
	}

	if s.cache != nil {
		if err := s.cache.SetQuote(r.Context(), symbol, *quote, quoteCacheTTL); err != nil {
			log.Printf("cache set error: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, quote)
}

func (s *Server) batchQuotes(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("symbols")
	if raw == "" {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}

	symbols := strings.Split(strings.ToUpper(raw), ",")
	if len(symbols) > 50 {
		symbols = symbols[:50]
	}

	result := make(map[string]any)

	// Check cache first
	var misses []string
	if s.cache != nil {
		hits, m := s.cache.GetQuotes(r.Context(), symbols)
		misses = m
		for k, v := range hits {
			result[k] = v
		}
	} else {
		misses = symbols
	}

	// Fetch misses from ASX
	if len(misses) > 0 && s.asxQuote != nil {
		fetched, _ := s.asxQuote.FetchQuotes(r.Context(), misses)
		for k, v := range fetched {
			result[k] = v
			if s.cache != nil {
				if err := s.cache.SetQuote(r.Context(), k, *v, quoteCacheTTL); err != nil {
					log.Printf("cache set error: %v", err)
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, result)
}
