package scheduler

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/config"
	"github.com/Adstar123/equitylens/backend/internal/ingestion"
	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/Adstar123/equitylens/backend/internal/scoring"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/google/uuid"
)

// Scheduler orchestrates data ingestion, scoring, and config seeding.
type Scheduler struct {
	db             *storage.DB
	yahoo          *ingestion.YahooClient
	asx            *ingestion.ASXClient
	alphaVantage   *ingestion.AlphaVantageClient // optional fallback
}

// NewScheduler creates a new Scheduler with the given database and Yahoo client.
func NewScheduler(db *storage.DB, yahoo *ingestion.YahooClient) *Scheduler {
	return &Scheduler{
		db:    db,
		yahoo: yahoo,
		asx:   ingestion.NewASXClient(),
	}
}

// SetAlphaVantage adds the Alpha Vantage client as a fallback for company listings.
func (s *Scheduler) SetAlphaVantage(apiKey string) {
	if apiKey != "" {
		s.alphaVantage = ingestion.NewAlphaVantageClient(apiKey)
	}
}

// SeedFromYAML loads YAML configs from disk into the database.
// It only seeds configs that don't already have any versions — it won't
// overwrite user edits made through the admin UI.
func (s *Scheduler) SeedFromYAML(ctx context.Context, dir string) error {
	configs, err := config.LoadSeedConfigs(dir)
	if err != nil {
		return err
	}

	for _, cfg := range configs {
		// Upsert the sector row.
		sector := models.Sector{
			ID:          uuid.New(),
			Key:         cfg.Sector,
			DisplayName: cfg.DisplayName,
		}
		if err := s.db.UpsertSector(ctx, sector); err != nil {
			log.Printf("seed: failed to upsert sector %s: %v", cfg.Sector, err)
			continue
		}

		// Re-fetch the sector to get its actual ID (upsert may have matched existing).
		sectorRow, err := s.db.GetSectorByKey(ctx, cfg.Sector)
		if err != nil || sectorRow == nil {
			log.Printf("seed: failed to fetch sector %s after upsert: %v", cfg.Sector, err)
			continue
		}

		// Check if any config version already exists for this sector.
		versions, err := s.db.ListConfigVersions(ctx, sectorRow.ID)
		if err != nil {
			log.Printf("seed: failed to list config versions for %s: %v", cfg.Sector, err)
			continue
		}

		if len(versions) > 0 {
			log.Printf("seed: skipping %s — %d version(s) already exist", cfg.Sector, len(versions))
			continue
		}

		// Save as version 1 and publish it.
		configRow := storage.SectorConfigRow{
			ID:        uuid.New(),
			SectorID:  sectorRow.ID,
			Version:   1,
			ConfigJSON: cfg,
			IsActive:  false,
		}
		if err := s.db.SaveConfig(ctx, configRow); err != nil {
			log.Printf("seed: failed to save config for %s: %v", cfg.Sector, err)
			continue
		}
		if err := s.db.PublishConfig(ctx, configRow.ID); err != nil {
			log.Printf("seed: failed to publish config for %s: %v", cfg.Sector, err)
			continue
		}

		log.Printf("seed: seeded and published config for %s (v1)", cfg.Sector)
	}

	return nil
}

// ScoreCompany fetches data and scores a single company by symbol.
// If the company doesn't exist in the database, it fetches a profile from Yahoo
// and upserts it. Returns (nil, nil) if the company has no sector or no active config.
func (s *Scheduler) ScoreCompany(ctx context.Context, symbol string) (*models.Score, error) {
	// Look up the company, or fetch from Yahoo if not found.
	company, err := s.db.GetCompanyBySymbol(ctx, symbol)
	if err != nil {
		return nil, err
	}

	if company == nil {
		profile, err := s.yahoo.FetchProfile(ctx, symbol)
		if err != nil {
			return nil, err
		}
		now := time.Now()
		company = &models.Company{
			ID:          uuid.New(),
			Symbol:      profile.Symbol,
			Name:        profile.Name,
			MarketCap:   &profile.MarketCap,
			LastUpdated: &now,
		}
		if err := s.db.UpsertCompany(ctx, *company); err != nil {
			return nil, err
		}
	}

	// If the company has no sector, we can't score it.
	if company.SectorID == nil {
		return nil, nil
	}

	// Get the active config for the company's sector.
	activeConfig, err := s.db.GetActiveConfig(ctx, *company.SectorID)
	if err != nil {
		return nil, err
	}
	if activeConfig == nil {
		return nil, nil
	}

	// Fetch financials from Yahoo.
	financials, err := s.yahoo.FetchFinancials(ctx, symbol)
	if err != nil {
		return nil, err
	}

	// Run the scoring engine.
	result, err := scoring.ScoreCompany(activeConfig.ConfigJSON, financials)
	if err != nil {
		return nil, err
	}

	// Build the score model and upsert it.
	score := models.Score{
		ID:             uuid.New(),
		CompanyID:      company.ID,
		SectorConfigID: activeConfig.ID,
		CompositeScore: result.CompositeScore,
		Rating:         result.Rating,
		Breakdown:      result.Breakdown,
		ScoredAt:       time.Now(),
	}
	if err := s.db.UpsertScore(ctx, score); err != nil {
		return nil, err
	}

	return &score, nil
}

// ScoreSector re-scores all companies in the given sector.
func (s *Scheduler) ScoreSector(ctx context.Context, sectorID uuid.UUID) error {
	companies, err := s.db.ListCompaniesBySector(ctx, sectorID)
	if err != nil {
		return err
	}

	activeConfig, err := s.db.GetActiveConfig(ctx, sectorID)
	if err != nil {
		return err
	}
	if activeConfig == nil {
		log.Printf("score-sector: no active config for sector %s, skipping", sectorID)
		return nil
	}

	consecutiveFails := 0
	for _, company := range companies {
		// If we hit 5+ consecutive failures, pause 2 minutes (likely rate limited)
		if consecutiveFails >= 5 {
			log.Printf("score-sector: %d consecutive failures, pausing 2 minutes", consecutiveFails)
			time.Sleep(2 * time.Minute)
			consecutiveFails = 0
		}

		financials, err := s.yahoo.FetchFinancials(ctx, company.Symbol)
		if err != nil {
			log.Printf("score-sector: failed to fetch financials for %s: %v", company.Symbol, err)
			consecutiveFails++
			continue
		}
		consecutiveFails = 0

		result, err := scoring.ScoreCompany(activeConfig.ConfigJSON, financials)
		if err != nil {
			log.Printf("score-sector: failed to score %s: %v", company.Symbol, err)
			continue
		}

		score := models.Score{
			ID:             uuid.New(),
			CompanyID:      company.ID,
			SectorConfigID: activeConfig.ID,
			CompositeScore: result.CompositeScore,
			Rating:         result.Rating,
			Breakdown:      result.Breakdown,
			ScoredAt:       time.Now(),
		}
		if err := s.db.UpsertScore(ctx, score); err != nil {
			log.Printf("score-sector: failed to upsert score for %s: %v", company.Symbol, err)
			continue
		}

		log.Printf("score-sector: scored %s — %.1f (%s)", company.Symbol, result.CompositeScore, result.Rating)
	}

	return nil
}

// SyncASXCompanies fetches the full ASX company list from external sources,
// maps each company to an internal sector, and upserts them into the database.
// Uses ASX website as primary source, Alpha Vantage as fallback.
func (s *Scheduler) SyncASXCompanies(ctx context.Context) error {
	log.Println("sync-asx: fetching company list from ASX website")

	companies, err := s.asx.FetchAllCompanies(ctx)
	if err != nil {
		log.Printf("sync-asx: ASX fetch failed: %v — trying Alpha Vantage fallback", err)

		if s.alphaVantage == nil {
			return fmt.Errorf("ASX fetch failed and no Alpha Vantage key configured: %w", err)
		}

		companies, err = s.alphaVantage.FetchASXCompanies(ctx)
		if err != nil {
			return fmt.Errorf("both ASX and Alpha Vantage fetches failed: %w", err)
		}
	}

	log.Printf("sync-asx: fetched %d companies, syncing to database", len(companies))

	synced, skipped := 0, 0
	for _, c := range companies {
		sectorKey := ingestion.MapGICSSector(c.GICSSector)

		var sectorID *uuid.UUID
		if sectorKey != "" {
			sector, err := s.db.GetSectorByKey(ctx, sectorKey)
			if err != nil {
				log.Printf("sync-asx: failed to look up sector %s: %v", sectorKey, err)
			}
			if sector != nil {
				sectorID = &sector.ID
			}
		}

		company := models.Company{
			ID:     uuid.New(),
			Symbol: c.Symbol,
			Name:   c.Name,
			SectorID: sectorID,
		}
		if err := s.db.UpsertCompany(ctx, company); err != nil {
			log.Printf("sync-asx: failed to upsert %s: %v", c.Symbol, err)
			skipped++
			continue
		}
		synced++
	}

	log.Printf("sync-asx: complete — %d synced, %d skipped", synced, skipped)
	return nil
}

// RefreshAll fetches the latest data for all tracked companies and re-scores them.
func (s *Scheduler) RefreshAll(ctx context.Context) error {
	sectors, err := s.db.ListSectors(ctx)
	if err != nil {
		return err
	}

	log.Printf("refresh: starting full refresh across %d sector(s)", len(sectors))

	for _, sector := range sectors {
		log.Printf("refresh: scoring sector %s (%s)", sector.DisplayName, sector.Key)
		if err := s.ScoreSector(ctx, sector.ID); err != nil {
			log.Printf("refresh: failed to score sector %s: %v", sector.Key, err)
			continue
		}
	}

	log.Printf("refresh: complete")
	return nil
}
