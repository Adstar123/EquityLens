package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/Adstar123/equitylens/backend/internal/auth"
	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/Adstar123/equitylens/backend/internal/scoring"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// listConfigs returns all sectors with their active config (or null).
func (s *Server) listConfigs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sectors, err := s.db.ListSectors(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sectors")
		return
	}

	type sectorWithConfig struct {
		Sector       models.Sector            `json:"sector"`
		ActiveConfig *storage.SectorConfigRow  `json:"active_config"`
	}

	results := make([]sectorWithConfig, 0, len(sectors))
	for _, sector := range sectors {
		active, err := s.db.GetActiveConfig(ctx, sector.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get active config")
			return
		}
		results = append(results, sectorWithConfig{
			Sector:       sector,
			ActiveConfig: active,
		})
	}

	writeJSON(w, http.StatusOK, results)
}

// getConfig returns the active config for a sector.
func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sectorKey := chi.URLParam(r, "sector")

	sector, err := s.db.GetSectorByKey(ctx, sectorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get sector")
		return
	}
	if sector == nil {
		writeError(w, http.StatusNotFound, "sector not found")
		return
	}

	active, err := s.db.GetActiveConfig(ctx, sector.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get active config")
		return
	}
	if active == nil {
		writeError(w, http.StatusNotFound, "no active config for sector")
		return
	}

	writeJSON(w, http.StatusOK, active)
}

// updateConfig creates a new config version for a sector (unpublished draft).
func (s *Server) updateConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sectorKey := chi.URLParam(r, "sector")

	sector, err := s.db.GetSectorByKey(ctx, sectorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get sector")
		return
	}
	if sector == nil {
		writeError(w, http.StatusNotFound, "sector not found")
		return
	}

	var cfg models.SectorConfig
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Determine latest version number.
	versions, err := s.db.ListConfigVersions(ctx, sector.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list config versions")
		return
	}
	latestVersion := 0
	if len(versions) > 0 {
		latestVersion = versions[0].Version // sorted DESC
	}

	// Get created_by from auth context.
	var createdBy *uuid.UUID
	if claims := auth.GetUser(ctx); claims != nil {
		createdBy = &claims.UserID
	}

	row := storage.SectorConfigRow{
		ID:         uuid.New(),
		SectorID:   sector.ID,
		Version:    latestVersion + 1,
		ConfigJSON: cfg,
		IsActive:   false,
		CreatedBy:  createdBy,
	}

	if err := s.db.SaveConfig(ctx, row); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save config")
		return
	}

	writeJSON(w, http.StatusCreated, row)
}

// previewConfig scores sample companies with a draft config for comparison.
func (s *Server) previewConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sectorKey := chi.URLParam(r, "sector")

	sector, err := s.db.GetSectorByKey(ctx, sectorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get sector")
		return
	}
	if sector == nil {
		writeError(w, http.StatusNotFound, "sector not found")
		return
	}

	var draftConfig models.SectorConfig
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&draftConfig); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get up to 5 companies from the sector.
	companies, err := s.db.ListCompaniesBySector(ctx, sector.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list companies")
		return
	}
	if len(companies) > 5 {
		companies = companies[:5]
	}

	type previewScore struct {
		Symbol         string  `json:"symbol"`
		CompanyName    string  `json:"company_name"`
		CompositeScore float64 `json:"composite_score"`
		Rating         string  `json:"rating"`
	}

	var currentScores []previewScore
	var previewScores []previewScore

	for _, company := range companies {
		// Get current score from DB.
		existingScore, err := s.db.GetLatestScore(ctx, company.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get score")
			return
		}
		if existingScore == nil {
			continue
		}

		currentScores = append(currentScores, previewScore{
			Symbol:         company.Symbol,
			CompanyName:    company.Name,
			CompositeScore: existingScore.CompositeScore,
			Rating:         existingScore.Rating,
		})

		// Extract the financials map from the score breakdown.
		financials := make(map[string]float64)
		for _, ratio := range existingScore.Breakdown.Ratios {
			financials[ratio.Key] = ratio.Value
		}

		// Re-score with the draft config.
		result, err := scoring.ScoreCompany(draftConfig, financials)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to score with draft config")
			return
		}

		previewScores = append(previewScores, previewScore{
			Symbol:         company.Symbol,
			CompanyName:    company.Name,
			CompositeScore: result.CompositeScore,
			Rating:         result.Rating,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"current": currentScores,
		"preview": previewScores,
	})
}

// publishConfig publishes the most recent unpublished config for a sector.
func (s *Server) publishConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sectorKey := chi.URLParam(r, "sector")

	sector, err := s.db.GetSectorByKey(ctx, sectorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get sector")
		return
	}
	if sector == nil {
		writeError(w, http.StatusNotFound, "sector not found")
		return
	}

	versions, err := s.db.ListConfigVersions(ctx, sector.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list config versions")
		return
	}

	// Find the most recent unpublished config.
	var target *storage.SectorConfigRow
	for i := range versions {
		if versions[i].PublishedAt == nil {
			target = &versions[i]
			break
		}
	}
	if target == nil {
		writeError(w, http.StatusBadRequest, "no unpublished config to publish")
		return
	}

	if err := s.db.PublishConfig(ctx, target.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to publish config")
		return
	}

	// Trigger re-score in background.
	sectorID := sector.ID
	go func() {
		if err := s.scheduler.ScoreSector(context.Background(), sectorID); err != nil {
			log.Printf("admin: background re-score failed for sector %s: %v", sectorKey, err)
		}
	}()

	writeJSON(w, http.StatusOK, map[string]string{"message": "published"})
}

// listConfigVersions returns all config versions for a sector.
func (s *Server) listConfigVersions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sectorKey := chi.URLParam(r, "sector")

	sector, err := s.db.GetSectorByKey(ctx, sectorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get sector")
		return
	}
	if sector == nil {
		writeError(w, http.StatusNotFound, "sector not found")
		return
	}

	versions, err := s.db.ListConfigVersions(ctx, sector.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list config versions")
		return
	}
	if versions == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	writeJSON(w, http.StatusOK, versions)
}

// listDefinitions returns all definitions (public endpoint).
func (s *Server) listDefinitions(w http.ResponseWriter, r *http.Request) {
	defs, err := s.db.ListDefinitions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list definitions")
		return
	}
	if defs == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, defs)
}

// updateDefinition upserts a single definition (admin endpoint).
func (s *Server) updateDefinition(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")

	var body struct {
		Label       string `json:"label"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	def := models.Definition{
		Key:         key,
		Label:       body.Label,
		Description: body.Description,
	}
	if err := s.db.UpsertDefinition(r.Context(), def); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save definition")
		return
	}

	writeJSON(w, http.StatusOK, def)
}
