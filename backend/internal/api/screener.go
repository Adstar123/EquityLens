package api

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
)

func (s *Server) screener(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	minScore := 0.0
	if ms := q.Get("min_score"); ms != "" {
		if v, err := strconv.ParseFloat(ms, 64); err == nil && v >= 0 && v <= 100 {
			minScore = v
		}
	}

	limit := 500
	if l := q.Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > 500 {
		limit = 500
	}

	offset := 0
	if o := q.Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 && v <= 100000 {
			offset = v
		}
	}

	sectorKey := q.Get("sector")

	var sectorID *uuid.UUID
	if sectorKey != "" {
		sector, err := s.db.GetSectorByKey(r.Context(), sectorKey)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to look up sector")
			return
		}
		if sector == nil {
			writeError(w, http.StatusNotFound, "sector not found")
			return
		}
		sectorID = &sector.ID
	}

	items, err := s.db.ListScreenerItems(r.Context(), sectorID, minScore, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query screener")
		return
	}
	if items == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, items)
}
