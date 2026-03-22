package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) listSectors(w http.ResponseWriter, r *http.Request) {
	sectors, err := s.db.ListSectors(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sectors")
		return
	}
	if sectors == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, sectors)
}

func (s *Server) getSectorRankings(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	sectorID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid sector id")
		return
	}

	scores, err := s.db.ListScoresBySector(r.Context(), sectorID, 0, 50, 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sector rankings")
		return
	}
	if scores == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, scores)
}
