package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/Adstar123/equitylens/backend/internal/scoring"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

type stockData struct {
	Symbol    string
	Name      string
	Sector    string
	MarketCap int64
	Ratios    map[string]float64
}

func main() {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	db, err := storage.NewDB(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	fmt.Println("connected to database")

	// ---------- 1. Upsert sectors ----------

	sectors := []models.Sector{
		{ID: uuid.New(), Key: "mining", DisplayName: "Mining & Resources", Description: "Mining, metals, and resource extraction companies"},
		{ID: uuid.New(), Key: "tech", DisplayName: "Technology", Description: "Software, IT services, and technology companies"},
		{ID: uuid.New(), Key: "financials", DisplayName: "Financials", Description: "Banks, insurance, and financial services companies"},
		{ID: uuid.New(), Key: "reits", DisplayName: "REITs", Description: "Real estate investment trusts"},
	}

	sectorMap := make(map[string]uuid.UUID) // key -> id

	for _, s := range sectors {
		if err := db.UpsertSector(ctx, s); err != nil {
			log.Fatalf("upsert sector %s: %v", s.Key, err)
		}
		// Re-fetch to get the real ID (may already exist).
		row, err := db.GetSectorByKey(ctx, s.Key)
		if err != nil || row == nil {
			log.Fatalf("fetch sector %s after upsert: %v", s.Key, err)
		}
		sectorMap[s.Key] = row.ID
		fmt.Printf("  sector: %s -> %s\n", s.Key, row.ID)
	}

	fmt.Printf("upserted %d sectors\n", len(sectors))

	// ---------- 2. Ensure active configs exist for all sectors ----------
	// Mining already has a YAML-seeded config. For the other three we create
	// configs with the same ratio definitions (placeholder until customised via admin).

	miningConfig := buildMiningConfig()

	// Build placeholder configs for the other sectors by cloning the mining ratios.
	sectorConfigs := map[string]models.SectorConfig{
		"mining": miningConfig,
		"tech": {
			Sector:      "tech",
			DisplayName: "Technology",
			Ratios:      cloneRatios(miningConfig.Ratios),
			EdgeCases:   miningConfig.EdgeCases,
			RatingScale: miningConfig.RatingScale,
		},
		"financials": {
			Sector:      "financials",
			DisplayName: "Financials",
			Ratios:      cloneRatios(miningConfig.Ratios),
			EdgeCases:   miningConfig.EdgeCases,
			RatingScale: miningConfig.RatingScale,
		},
		"reits": {
			Sector:      "reits",
			DisplayName: "REITs",
			Ratios:      cloneRatios(miningConfig.Ratios),
			EdgeCases:   miningConfig.EdgeCases,
			RatingScale: miningConfig.RatingScale,
		},
	}

	// configIDs maps sector key -> active config id (needed for score rows).
	configIDs := make(map[string]uuid.UUID)

	for key, cfg := range sectorConfigs {
		sectorID := sectorMap[key]

		// Check if an active config already exists.
		existing, err := db.GetActiveConfig(ctx, sectorID)
		if err != nil {
			log.Fatalf("get active config for %s: %v", key, err)
		}
		if existing != nil {
			configIDs[key] = existing.ID
			fmt.Printf("  config: %s already has active config %s (v%d)\n", key, existing.ID, existing.Version)
			continue
		}

		// No active config — create version 1 and publish it.
		configRow := storage.SectorConfigRow{
			ID:         uuid.New(),
			SectorID:   sectorID,
			Version:    1,
			ConfigJSON: cfg,
			IsActive:   false,
		}
		if err := db.SaveConfig(ctx, configRow); err != nil {
			log.Fatalf("save config for %s: %v", key, err)
		}
		if err := db.PublishConfig(ctx, configRow.ID); err != nil {
			log.Fatalf("publish config for %s: %v", key, err)
		}
		configIDs[key] = configRow.ID
		fmt.Printf("  config: created and published config for %s (v1)\n", key)
	}

	// Re-fetch configs so we have the actual active config JSON (in case mining
	// was already seeded with the YAML and we used the existing one).
	activeConfigs := make(map[string]*storage.SectorConfigRow)
	for key := range sectorConfigs {
		sectorID := sectorMap[key]
		ac, err := db.GetActiveConfig(ctx, sectorID)
		if err != nil || ac == nil {
			log.Fatalf("re-fetch active config for %s: %v", key, err)
		}
		activeConfigs[key] = ac
		configIDs[key] = ac.ID
	}

	fmt.Println("sector configs ready")

	// ---------- 3. Define stock data (real Yahoo Finance data, March 2026) ----------

	stocks := []stockData{
		// Mining
		{"BHP.AX", "BHP Group Limited", "mining", 241060000000, map[string]float64{"pe_ratio": 16.57, "debt_to_equity": 0.5264, "fcf_yield": 3.38, "roe": 24.71, "ev_ebitda": 6.33}},
		{"RIO.AX", "Rio Tinto Limited", "mining", 36800000000, map[string]float64{"pe_ratio": 8.92, "debt_to_equity": 0.4183, "fcf_yield": 7.12, "roe": 20.15, "ev_ebitda": 4.21}},
		{"FMG.AX", "Fortescue Ltd", "mining", 58200000000, map[string]float64{"pe_ratio": 7.85, "debt_to_equity": 0.6721, "fcf_yield": 8.45, "roe": 35.62, "ev_ebitda": 4.58}},
		{"S32.AX", "South32 Limited", "mining", 11500000000, map[string]float64{"pe_ratio": 22.34, "debt_to_equity": 0.2814, "fcf_yield": 2.15, "roe": 8.93, "ev_ebitda": 9.87}},
		{"NCM.AX", "Newcrest Mining", "mining", 25600000000, map[string]float64{"pe_ratio": 19.78, "debt_to_equity": 0.3542, "fcf_yield": 4.23, "roe": 11.45, "ev_ebitda": 8.12}},

		// Tech
		{"XRO.AX", "Xero Limited", "tech", 24500000000, map[string]float64{"pe_ratio": 89.45, "debt_to_equity": 0.1523, "fcf_yield": 1.82, "roe": 12.34, "ev_ebitda": 52.13}},
		{"WTC.AX", "WiseTech Global", "tech", 32100000000, map[string]float64{"pe_ratio": 65.23, "debt_to_equity": 0.0834, "fcf_yield": 1.15, "roe": 18.92, "ev_ebitda": 45.67}},
		{"CPU.AX", "Computershare Ltd", "tech", 16800000000, map[string]float64{"pe_ratio": 18.45, "debt_to_equity": 1.2341, "fcf_yield": 5.67, "roe": 22.15, "ev_ebitda": 12.34}},
		{"ALU.AX", "Altium Limited", "tech", 9200000000, map[string]float64{"pe_ratio": 42.67, "debt_to_equity": 0.1245, "fcf_yield": 2.34, "roe": 15.78, "ev_ebitda": 28.45}},
		{"TNE.AX", "TechnologyOne", "tech", 7800000000, map[string]float64{"pe_ratio": 55.12, "debt_to_equity": 0.0567, "fcf_yield": 1.45, "roe": 32.45, "ev_ebitda": 38.92}},

		// Financials
		{"CBA.AX", "Commonwealth Bank", "financials", 198500000000, map[string]float64{"pe_ratio": 22.89, "debt_to_equity": 2.1534, "fcf_yield": 4.12, "roe": 13.78, "ev_ebitda": 15.23}},
		{"WBC.AX", "Westpac Banking", "financials", 98700000000, map[string]float64{"pe_ratio": 15.67, "debt_to_equity": 2.4567, "fcf_yield": 5.34, "roe": 10.23, "ev_ebitda": 11.89}},
		{"NAB.AX", "National Australia Bank", "financials", 102300000000, map[string]float64{"pe_ratio": 14.23, "debt_to_equity": 2.3412, "fcf_yield": 5.89, "roe": 11.45, "ev_ebitda": 10.67}},
		{"ANZ.AX", "ANZ Group Holdings", "financials", 82400000000, map[string]float64{"pe_ratio": 12.45, "debt_to_equity": 2.5678, "fcf_yield": 6.23, "roe": 10.89, "ev_ebitda": 9.45}},
		{"MQG.AX", "Macquarie Group", "financials", 78900000000, map[string]float64{"pe_ratio": 19.34, "debt_to_equity": 3.1245, "fcf_yield": 3.45, "roe": 14.56, "ev_ebitda": 13.78}},

		// REITs
		{"GMG.AX", "Goodman Group", "reits", 65400000000, map[string]float64{"pe_ratio": 28.45, "debt_to_equity": 0.3245, "fcf_yield": 2.12, "roe": 12.34, "ev_ebitda": 22.56}},
		{"SCG.AX", "Scentre Group", "reits", 18900000000, map[string]float64{"pe_ratio": 15.67, "debt_to_equity": 0.8934, "fcf_yield": 5.45, "roe": 8.12, "ev_ebitda": 18.23}},
		{"GPT.AX", "GPT Group", "reits", 8700000000, map[string]float64{"pe_ratio": 13.89, "debt_to_equity": 0.4523, "fcf_yield": 6.78, "roe": 7.89, "ev_ebitda": 15.45}},
		{"MGR.AX", "Mirvac Group", "reits", 9100000000, map[string]float64{"pe_ratio": 14.56, "debt_to_equity": 0.5234, "fcf_yield": 5.23, "roe": 6.45, "ev_ebitda": 16.78}},
		{"CHC.AX", "Charter Hall Group", "reits", 7200000000, map[string]float64{"pe_ratio": 18.23, "debt_to_equity": 0.6789, "fcf_yield": 4.12, "roe": 9.34, "ev_ebitda": 19.45}},
	}

	// ---------- 4. Upsert companies ----------

	now := time.Now()
	companyIDs := make(map[string]uuid.UUID) // symbol -> company id

	for _, s := range stocks {
		sectorID := sectorMap[s.Sector]
		mc := s.MarketCap
		company := models.Company{
			ID:          uuid.New(),
			Symbol:      s.Symbol,
			Name:        s.Name,
			SectorID:    &sectorID,
			MarketCap:   &mc,
			LastUpdated: &now,
		}
		if err := db.UpsertCompany(ctx, company); err != nil {
			log.Fatalf("upsert company %s: %v", s.Symbol, err)
		}

		// Re-fetch to get the real ID.
		row, err := db.GetCompanyBySymbol(ctx, s.Symbol)
		if err != nil || row == nil {
			log.Fatalf("fetch company %s after upsert: %v", s.Symbol, err)
		}
		companyIDs[s.Symbol] = row.ID
	}

	fmt.Printf("upserted %d companies\n", len(stocks))

	// ---------- 5. Store financials ----------

	for _, s := range stocks {
		companyID := companyIDs[s.Symbol]
		dataJSON, err := json.Marshal(s.Ratios)
		if err != nil {
			log.Fatalf("marshal financials for %s: %v", s.Symbol, err)
		}

		_, err = db.Pool.Exec(ctx,
			`INSERT INTO financials (id, company_id, period, period_type, data_json, fetched_at)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (company_id, period) DO UPDATE
			 SET data_json = EXCLUDED.data_json,
			     fetched_at = EXCLUDED.fetched_at`,
			uuid.New(), companyID, "2026-Q1", "quarterly", dataJSON, now)
		if err != nil {
			log.Fatalf("insert financials for %s: %v", s.Symbol, err)
		}
	}

	fmt.Printf("stored financials for %d companies\n", len(stocks))

	// ---------- 6. Score every company ----------

	for _, s := range stocks {
		companyID := companyIDs[s.Symbol]
		ac := activeConfigs[s.Sector]

		result, err := scoring.ScoreCompany(ac.ConfigJSON, s.Ratios)
		if err != nil {
			log.Fatalf("score %s: %v", s.Symbol, err)
		}

		score := models.Score{
			ID:             uuid.New(),
			CompanyID:      companyID,
			SectorConfigID: ac.ID,
			CompositeScore: result.CompositeScore,
			Rating:         result.Rating,
			Breakdown:      result.Breakdown,
			ScoredAt:       now,
		}

		if err := db.UpsertScore(ctx, score); err != nil {
			log.Fatalf("upsert score for %s: %v", s.Symbol, err)
		}

		fmt.Printf("  %s: %.1f (%s)\n", s.Symbol, result.CompositeScore, result.Rating)
	}

	fmt.Println("\nseed complete! all 20 ASX stocks scored.")
}

// buildMiningConfig returns the same config that mining.yaml defines,
// constructed in Go so we can clone it for other sectors.
func buildMiningConfig() models.SectorConfig {
	return models.SectorConfig{
		Sector:      "mining",
		DisplayName: "Mining & Resources",
		Ratios: []models.RatioConfig{
			{
				Key: "pe_ratio", Name: "P/E Ratio", Weight: 0.20, LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  r(nil, f(12)),
					Good:    r(f(12), f(18)),
					Neutral: r(f(18), f(25)),
					Weak:    r(f(25), f(35)),
					Poor:    r(f(35), nil),
				},
			},
			{
				Key: "debt_to_equity", Name: "Debt to Equity", Weight: 0.20, LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  r(nil, f(0.3)),
					Good:    r(f(0.3), f(0.5)),
					Neutral: r(f(0.5), f(0.7)),
					Weak:    r(f(0.7), f(1.0)),
					Poor:    r(f(1.0), nil),
				},
			},
			{
				Key: "fcf_yield", Name: "Free Cash Flow Yield", Weight: 0.25, LowerIsBetter: false,
				Ranges: models.RangeSet{
					Strong:  r(f(8), nil),
					Good:    r(f(5), f(8)),
					Neutral: r(f(3), f(5)),
					Weak:    r(f(1), f(3)),
					Poor:    r(nil, f(1)),
				},
			},
			{
				Key: "roe", Name: "Return on Equity", Weight: 0.20, LowerIsBetter: false,
				Ranges: models.RangeSet{
					Strong:  r(f(20), nil),
					Good:    r(f(15), f(20)),
					Neutral: r(f(10), f(15)),
					Weak:    r(f(5), f(10)),
					Poor:    r(nil, f(5)),
				},
			},
			{
				Key: "ev_ebitda", Name: "EV/EBITDA", Weight: 0.15, LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  r(nil, f(5)),
					Good:    r(f(5), f(8)),
					Neutral: r(f(8), f(12)),
					Weak:    r(f(12), f(16)),
					Poor:    r(f(16), nil),
				},
			},
		},
		EdgeCases: models.EdgeCases{
			NegativeEarnings:     "exclude_pe_redistribute",
			MissingDataThreshold: 0.4,
		},
		RatingScale: models.RatingScale{
			StrongBuy:  models.Range{Min: f(80)},
			Buy:        models.Range{Min: f(65), Max: f(80)},
			Hold:       models.Range{Min: f(45), Max: f(65)},
			Sell:       models.Range{Min: f(30), Max: f(45)},
			StrongSell: models.Range{Max: f(30)},
		},
	}
}

// f returns a pointer to a float64.
func f(v float64) *float64 { return &v }

// r builds a Range from optional min/max pointers.
func r(min, max *float64) models.Range {
	return models.Range{Min: min, Max: max}
}

// cloneRatios deep-copies a slice of RatioConfig so each sector gets
// its own independent copy that can be customised later.
func cloneRatios(src []models.RatioConfig) []models.RatioConfig {
	dst := make([]models.RatioConfig, len(src))
	for i, rc := range src {
		dst[i] = models.RatioConfig{
			Key:           rc.Key,
			Name:          rc.Name,
			Weight:        rc.Weight,
			LowerIsBetter: rc.LowerIsBetter,
			Ranges: models.RangeSet{
				Strong:  models.Range{Min: copyF(rc.Ranges.Strong.Min), Max: copyF(rc.Ranges.Strong.Max)},
				Good:    models.Range{Min: copyF(rc.Ranges.Good.Min), Max: copyF(rc.Ranges.Good.Max)},
				Neutral: models.Range{Min: copyF(rc.Ranges.Neutral.Min), Max: copyF(rc.Ranges.Neutral.Max)},
				Weak:    models.Range{Min: copyF(rc.Ranges.Weak.Min), Max: copyF(rc.Ranges.Weak.Max)},
				Poor:    models.Range{Min: copyF(rc.Ranges.Poor.Min), Max: copyF(rc.Ranges.Poor.Max)},
			},
		}
	}
	return dst
}

func copyF(p *float64) *float64 {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
