package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/joho/godotenv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Standalone export CLI — dumps the latest raw ratio values for every screened
// (index member) company to CSV, one row per company, for calibrating the
// per-sector rating bands.
func main() {
	out := flag.String("out", "ratios_export.csv", "output CSV path")
	flag.Parse()

	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx,
		`SELECT c.symbol, c.name, sec.display_name,
		        s.composite_score, s.rating, s.breakdown_json, s.scored_at
		 FROM scores s
		 JOIN companies c ON c.id = s.company_id
		 JOIN sectors sec ON sec.id = c.sector_id
		 WHERE c.in_index
		 AND s.scored_at = (SELECT MAX(s2.scored_at) FROM scores s2 WHERE s2.company_id = s.company_id)
		 AND s.sector_config_id IN (SELECT id FROM sector_configs WHERE is_active = true)
		 ORDER BY sec.display_name, c.symbol`)
	if err != nil {
		log.Fatalf("query failed: %v", err)
	}
	defer rows.Close()

	type exportRow struct {
		symbol, name, sector, rating, scoredAt string
		composite                              float64
		ratios                                 map[string]models.RatioResult
		context                                map[string]float64
	}

	var data []exportRow
	ratioKeys := map[string]bool{}
	contextKeys := map[string]bool{}

	for rows.Next() {
		var r exportRow
		var breakdownBytes []byte
		var scoredAt any
		if err := rows.Scan(&r.symbol, &r.name, &r.sector, &r.composite, &r.rating, &breakdownBytes, &scoredAt); err != nil {
			log.Fatalf("scan failed: %v", err)
		}
		r.scoredAt = fmt.Sprintf("%v", scoredAt)

		var breakdown models.Breakdown
		if err := json.Unmarshal(breakdownBytes, &breakdown); err != nil {
			log.Fatalf("bad breakdown for %s: %v", r.symbol, err)
		}
		r.ratios = make(map[string]models.RatioResult, len(breakdown.Ratios))
		for _, ratio := range breakdown.Ratios {
			r.ratios[ratio.Key] = ratio
			ratioKeys[ratio.Key] = true
		}
		r.context = make(map[string]float64, len(breakdown.ContextRatios))
		for _, ctxRatio := range breakdown.ContextRatios {
			r.context[ctxRatio.Key] = ctxRatio.Value
			contextKeys[ctxRatio.Key] = true
		}
		data = append(data, r)
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("rows error: %v", err)
	}

	sortedRatioKeys := sortedKeys(ratioKeys)
	sortedContextKeys := sortedKeys(contextKeys)

	f, err := os.Create(*out)
	if err != nil {
		log.Fatalf("failed to create %s: %v", *out, err)
	}
	defer f.Close()
	w := csv.NewWriter(f)

	header := []string{"symbol", "name", "sector", "composite_score", "rating"}
	for _, k := range sortedRatioKeys {
		header = append(header, k, k+"_band")
	}
	for _, k := range sortedContextKeys {
		header = append(header, k)
	}
	header = append(header, "scored_at")
	if err := w.Write(header); err != nil {
		log.Fatalf("write failed: %v", err)
	}

	for _, r := range data {
		record := []string{r.symbol, r.name, r.sector, formatFloat(r.composite), r.rating}
		for _, k := range sortedRatioKeys {
			if ratio, ok := r.ratios[k]; ok {
				record = append(record, formatFloat(ratio.Value), ratio.RangeBucket)
			} else {
				record = append(record, "", "")
			}
		}
		for _, k := range sortedContextKeys {
			if v, ok := r.context[k]; ok {
				record = append(record, formatFloat(v))
			} else {
				record = append(record, "")
			}
		}
		record = append(record, r.scoredAt)
		if err := w.Write(record); err != nil {
			log.Fatalf("write failed: %v", err)
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		log.Fatalf("flush failed: %v", err)
	}
	log.Printf("export: wrote %d companies to %s", len(data), *out)
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func formatFloat(v float64) string {
	return fmt.Sprintf("%g", v)
}
