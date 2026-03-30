package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

func (s *Server) getQuote(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))
	if symbol == "" {
		writeError(w, http.StatusBadRequest, "symbol required")
		return
	}

	quote, err := s.db.GetPrice(r.Context(), symbol)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get quote")
		return
	}
	if quote == nil {
		writeError(w, http.StatusNotFound, "no price data available")
		return
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

	quotes, err := s.db.GetPrices(r.Context(), symbols)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get quotes")
		return
	}

	writeJSON(w, http.StatusOK, quotes)
}
