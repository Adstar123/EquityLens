package scoring

import (
	"github.com/Adstar123/equitylens/backend/internal/models"
)

// ScoreResult holds the output of the scoring engine.
type ScoreResult struct {
	CompositeScore float64
	Rating         string
	Breakdown      models.Breakdown
}

// ScoreCompany computes a composite score (0-100) with a rating label
// for a company given its sector config and a map of financial ratios.
// This is a pure function — no database access, no side effects.
func ScoreCompany(config models.SectorConfig, financials map[string]float64) (*ScoreResult, error) {
	type scored struct {
		ratioConfig models.RatioConfig
		value       float64
		bucket      string
		points      int
	}

	var results []scored
	totalRatios := len(config.Ratios)
	skippedCount := 0

	for _, rc := range config.Ratios {
		value, exists := financials[rc.Key]

		// If the ratio key is missing from financials, skip it.
		if !exists {
			skippedCount++
			continue
		}

		// Handle negative P/E edge case.
		if rc.Key == "pe_ratio" && value < 0 &&
			config.EdgeCases.NegativeEarnings == "exclude_pe_redistribute" {
			skippedCount++
			continue
		}

		bucket, points := classifyValue(value, rc.Ranges)
		results = append(results, scored{
			ratioConfig: rc,
			value:       value,
			bucket:      bucket,
			points:      points,
		})
	}

	// Check missing data threshold.
	if totalRatios == 0 || float64(skippedCount)/float64(totalRatios) > config.EdgeCases.MissingDataThreshold {
		return &ScoreResult{
			CompositeScore: 0,
			Rating:         "insufficient_data",
			Breakdown:      models.Breakdown{},
		}, nil
	}

	// Calculate the sum of remaining weights for redistribution.
	remainingWeightSum := 0.0
	for _, r := range results {
		remainingWeightSum += r.ratioConfig.Weight
	}

	// Build breakdown and compute weighted sum.
	var weightedSum float64
	breakdown := models.Breakdown{
		Ratios: make([]models.RatioResult, 0, len(results)),
	}

	for _, r := range results {
		adjustedWeight := r.ratioConfig.Weight / remainingWeightSum
		ws := float64(r.points) * adjustedWeight

		breakdown.Ratios = append(breakdown.Ratios, models.RatioResult{
			Key:           r.ratioConfig.Key,
			Name:          r.ratioConfig.Name,
			Value:         r.value,
			RangeBucket:   r.bucket,
			Points:        r.points,
			Weight:        adjustedWeight,
			WeightedScore: ws,
		})

		weightedSum += ws
	}

	compositeScore := weightedSum / 5.0 * 100.0
	rating := mapRating(compositeScore, config.RatingScale)

	return &ScoreResult{
		CompositeScore: compositeScore,
		Rating:         rating,
		Breakdown:      breakdown,
	}, nil
}

// classifyValue determines which range bucket a value falls into and returns
// the bucket name and its point value. Ranges are checked in order:
// strong (5), good (4), neutral (3), weak (2), poor (1).
func classifyValue(value float64, ranges models.RangeSet) (string, int) {
	type bucketDef struct {
		name   string
		r      models.Range
		points int
	}

	buckets := []bucketDef{
		{"strong", ranges.Strong, 5},
		{"good", ranges.Good, 4},
		{"neutral", ranges.Neutral, 3},
		{"weak", ranges.Weak, 2},
		{"poor", ranges.Poor, 1},
	}

	for _, b := range buckets {
		if matchesRange(value, b.r) {
			return b.name, b.points
		}
	}

	// Default to neutral if no range matches (shouldn't happen with well-formed configs).
	return "neutral", 3
}

// matchesRange checks if a value falls within a range.
// A value matches if:
//   - min is nil OR value >= min
//   - max is nil OR value < max
func matchesRange(value float64, r models.Range) bool {
	if r.Min != nil && value < *r.Min {
		return false
	}
	if r.Max != nil && value >= *r.Max {
		return false
	}
	return true
}

// mapRating converts a composite score to a rating label using the rating scale.
// The rating scale ranges are checked in order from best to worst.
func mapRating(score float64, scale models.RatingScale) string {
	type ratingDef struct {
		name string
		r    models.Range
	}

	ratings := []ratingDef{
		{"strong_buy", scale.StrongBuy},
		{"buy", scale.Buy},
		{"hold", scale.Hold},
		{"sell", scale.Sell},
		{"strong_sell", scale.StrongSell},
	}

	for _, rd := range ratings {
		if matchesRange(score, rd.r) {
			return rd.name
		}
	}

	return "hold"
}
