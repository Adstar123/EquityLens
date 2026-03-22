package api

import (
	"net/http"
	"strings"

	"github.com/Adstar123/equitylens/backend/internal/auth"
	"github.com/go-chi/chi/v5"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) searchTickers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	companies, err := s.db.SearchCompanies(r.Context(), q, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search companies")
		return
	}
	if companies == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, companies)
}

func (s *Server) getTickerDetail(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))

	company, err := s.db.GetCompanyBySymbol(r.Context(), symbol)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get company")
		return
	}

	if company == nil {
		// On-demand fetch from Yahoo via scheduler
		score, err := s.scheduler.ScoreCompany(r.Context(), symbol)
		if err != nil {
			writeError(w, http.StatusBadGateway, "failed to fetch company data")
			return
		}

		// Re-fetch the company after scoring
		company, err = s.db.GetCompanyBySymbol(r.Context(), symbol)
		if err != nil || company == nil {
			writeError(w, http.StatusNotFound, "company not found")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"company": company,
			"score":   score,
		})
		return
	}

	// Get latest score for the existing company
	score, err := s.db.GetLatestScore(r.Context(), company.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get score")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"company": company,
		"score":   score,
	})
}

func (s *Server) getTickerScores(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))

	company, err := s.db.GetCompanyBySymbol(r.Context(), symbol)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get company")
		return
	}
	if company == nil {
		writeError(w, http.StatusNotFound, "company not found")
		return
	}

	score, err := s.db.GetLatestScore(r.Context(), company.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get score")
		return
	}
	if score == nil {
		writeError(w, http.StatusNotFound, "no scores found")
		return
	}

	writeJSON(w, http.StatusOK, score)
}

func (s *Server) getMe(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUser(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user_id": claims.UserID,
		"email":   claims.Email,
		"name":    claims.Name,
	})
}

func (s *Server) getWatchlist(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUser(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	companies, err := s.db.GetWatchlist(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get watchlist")
		return
	}
	if companies == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, companies)
}

func (s *Server) addToWatchlist(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUser(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))
	company, err := s.db.GetCompanyBySymbol(r.Context(), symbol)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get company")
		return
	}
	if company == nil {
		writeError(w, http.StatusNotFound, "company not found")
		return
	}

	if err := s.db.AddToWatchlist(r.Context(), claims.UserID, company.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add to watchlist")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "added"})
}

func (s *Server) removeFromWatchlist(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUser(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	symbol := strings.ToUpper(chi.URLParam(r, "symbol"))
	company, err := s.db.GetCompanyBySymbol(r.Context(), symbol)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get company")
		return
	}
	if company == nil {
		writeError(w, http.StatusNotFound, "company not found")
		return
	}

	if err := s.db.RemoveFromWatchlist(r.Context(), claims.UserID, company.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove from watchlist")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "removed"})
}
