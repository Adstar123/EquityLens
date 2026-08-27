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

// Standalone export CLI — dumps the latest scored ratios for every screened
// (index member) company, for calibrating the per-sector rating bands and for
// sensitivity analysis on the weightings.
//
// Two shapes of the same data are written:
//
//	-out   wide, one row per company, every ratio spread across columns
//	-long  tidy, one row per company/ratio pair (easier to pivot)
//
// Per ratio each file carries the exact figures the ticker page renders:
//
//	value         raw ratio value                 ("Value" column)
//	band          range bucket it landed in       ("Range" column)
//	points        1-5 for the band                (shown on row hover)
//	weight        effective weight, 0-1           ("Weight" column, site rounds it to a %)
//	contribution  points * weight, 0-5            ("Contribution" column)
//	score_points  contribution / 5 * 100, 0-100   (share of the composite)
//
// score_points is the one that answers "how much of this composite came from
// this ratio" — per company they sum to composite_score.
//
// Weights are the *effective* weights. When a ratio is missing for a company
// the scoring engine redistributes its weight across the rest, so these can
// differ from the raw sector config. That's deliberate: it's what the site
// shows, and it's what has to be used for the numbers to reconcile.
// exportRow is one company's latest score, flattened out of breakdown_json.
type exportRow struct {
	symbol, name, sector, rating, scoredAt string
	composite                              float64
	ratios                                 map[string]models.RatioResult
	order                                  []string
	context                                map[string]float64
}

func main() {
	out := flag.String("out", "ratios_export.csv", "wide output CSV path (one row per company)")
	long := flag.String("long", "ratios_contributions.csv", "tidy output CSV path (one row per company/ratio), empty to skip")
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
			r.order = append(r.order, ratio.Key)
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

	mismatches := writeWide(*out, data, sortedRatioKeys, sortedContextKeys)
	log.Printf("export: wrote %d companies to %s", len(data), *out)

	if *long != "" {
		lines := writeLong(*long, data)
		log.Printf("export: wrote %d company/ratio rows to %s", lines, *long)
	}

	if mismatches > 0 {
		log.Printf("export: warning — %d companies whose score_points don't sum to composite_score", mismatches)
	}
}

// writeWide emits one row per company with every ratio spread across columns,
// and returns the number of companies whose per-ratio score_points failed to
// reconcile with the stored composite.
func writeWide(path string, data []exportRow, ratioKeys, contextKeys []string) int {
	f, err := os.Create(path)
	if err != nil {
		log.Fatalf("failed to create %s: %v", path, err)
	}
	defer f.Close()
	w := csv.NewWriter(f)

	header := []string{"symbol", "name", "sector", "composite_score", "rating", "ratios_scored"}
	for _, k := range ratioKeys {
		header = append(header, k, k+"_band", k+"_points", k+"_weight", k+"_contribution", k+"_score_points")
	}
	header = append(header, contextKeys...)
	header = append(header, "score_points_total", "scored_at")
	if err := w.Write(header); err != nil {
		log.Fatalf("write failed: %v", err)
	}

	mismatches := 0
	for _, r := range data {
		record := []string{r.symbol, r.name, r.sector, formatFloat(r.composite), r.rating, fmt.Sprint(len(r.ratios))}
		total := 0.0
		for _, k := range ratioKeys {
			ratio, ok := r.ratios[k]
			if !ok {
				record = append(record, "", "", "", "", "", "")
				continue
			}
			sp := scorePoints(ratio)
			total += sp
			record = append(record,
				formatFloat(ratio.Value),
				ratio.RangeBucket,
				fmt.Sprint(ratio.Points),
				formatFloat(ratio.Weight),
				formatFloat(ratio.WeightedScore),
				formatFloat(sp),
			)
		}
		for _, k := range contextKeys {
			if v, ok := r.context[k]; ok {
				record = append(record, formatFloat(v))
			} else {
				record = append(record, "")
			}
		}
		if diff := total - r.composite; diff > 0.01 || diff < -0.01 {
			mismatches++
		}
		record = append(record, formatFloat(total), r.scoredAt)
		if err := w.Write(record); err != nil {
			log.Fatalf("write failed: %v", err)
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		log.Fatalf("flush failed: %v", err)
	}
	return mismatches
}

// writeLong emits one row per company/ratio pair, ratios in the same order the
// ticker page lists them, and returns the row count.
func writeLong(path string, data []exportRow) int {
	f, err := os.Create(path)
	if err != nil {
		log.Fatalf("failed to create %s: %v", path, err)
	}
	defer f.Close()
	w := csv.NewWriter(f)

	if err := w.Write([]string{
		"symbol", "name", "sector", "composite_score", "rating",
		"ratio_key", "ratio_name", "value", "band", "points",
		"weight", "contribution", "score_points", "scored_at",
	}); err != nil {
		log.Fatalf("write failed: %v", err)
	}

	lines := 0
	for _, r := range data {
		for _, k := range r.order {
			ratio := r.ratios[k]
			if err := w.Write([]string{
				r.symbol, r.name, r.sector, formatFloat(r.composite), r.rating,
				ratio.Key, ratio.Name,
				formatFloat(ratio.Value), ratio.RangeBucket, fmt.Sprint(ratio.Points),
				formatFloat(ratio.Weight), formatFloat(ratio.WeightedScore), formatFloat(scorePoints(ratio)),
				r.scoredAt,
			}); err != nil {
				log.Fatalf("write failed: %v", err)
			}
			lines++
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		log.Fatalf("flush failed: %v", err)
	}
	return lines
}

// scorePoints converts a ratio's weighted score (0-5) into its share of the
// 0-100 composite, matching compositeScore = weightedSum / 5 * 100.
func scorePoints(r models.RatioResult) float64 {
	return r.WeightedScore / 5.0 * 100.0
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
