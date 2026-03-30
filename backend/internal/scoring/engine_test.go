package scoring

import (
	"math"
	"testing"

	"github.com/Adstar123/equitylens/backend/internal/models"
)

// Helper to create a *float64 from a float64 literal.
func fp(v float64) *float64 { return &v }

// buildMiningConfig recreates the mining sector config from mining.yaml for testing.
func buildMiningConfig() models.SectorConfig {
	return models.SectorConfig{
		Sector:      "mining",
		DisplayName: "Mining & Resources",
		Ratios: []models.RatioConfig{
			{
				Key:           "pe_ratio",
				Name:          "P/E Ratio",
				Weight:        0.20,
				LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  models.Range{Max: fp(12)},
					Good:    models.Range{Min: fp(12), Max: fp(18)},
					Neutral: models.Range{Min: fp(18), Max: fp(25)},
					Weak:    models.Range{Min: fp(25), Max: fp(35)},
					Poor:    models.Range{Min: fp(35)},
				},
			},
			{
				Key:           "debt_to_equity",
				Name:          "Debt to Equity",
				Weight:        0.20,
				LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  models.Range{Max: fp(0.3)},
					Good:    models.Range{Min: fp(0.3), Max: fp(0.5)},
					Neutral: models.Range{Min: fp(0.5), Max: fp(0.7)},
					Weak:    models.Range{Min: fp(0.7), Max: fp(1.0)},
					Poor:    models.Range{Min: fp(1.0)},
				},
			},
			{
				Key:           "fcf_yield",
				Name:          "Free Cash Flow Yield",
				Weight:        0.25,
				LowerIsBetter: false,
				Ranges: models.RangeSet{
					Strong:  models.Range{Min: fp(8)},
					Good:    models.Range{Min: fp(5), Max: fp(8)},
					Neutral: models.Range{Min: fp(3), Max: fp(5)},
					Weak:    models.Range{Min: fp(1), Max: fp(3)},
					Poor:    models.Range{Max: fp(1)},
				},
			},
			{
				Key:           "roe",
				Name:          "Return on Equity",
				Weight:        0.20,
				LowerIsBetter: false,
				Ranges: models.RangeSet{
					Strong:  models.Range{Min: fp(20)},
					Good:    models.Range{Min: fp(15), Max: fp(20)},
					Neutral: models.Range{Min: fp(10), Max: fp(15)},
					Weak:    models.Range{Min: fp(5), Max: fp(10)},
					Poor:    models.Range{Max: fp(5)},
				},
			},
			{
				Key:           "ev_ebitda",
				Name:          "EV/EBITDA",
				Weight:        0.15,
				LowerIsBetter: true,
				Ranges: models.RangeSet{
					Strong:  models.Range{Max: fp(5)},
					Good:    models.Range{Min: fp(5), Max: fp(8)},
					Neutral: models.Range{Min: fp(8), Max: fp(12)},
					Weak:    models.Range{Min: fp(12), Max: fp(16)},
					Poor:    models.Range{Min: fp(16)},
				},
			},
		},
		EdgeCases: models.EdgeCases{
			NegativeEarnings:     "exclude_pe_redistribute",
			MissingDataThreshold: 0.4,
		},
		RatingScale: models.RatingScale{
			StrongBuy:  models.Range{Min: fp(80)},
			Buy:        models.Range{Min: fp(65), Max: fp(80)},
			Hold:       models.Range{Min: fp(45), Max: fp(65)},
			Sell:       models.Range{Min: fp(30), Max: fp(45)},
			StrongSell: models.Range{Max: fp(30)},
		},
	}
}

func TestScoreCompany(t *testing.T) {
	config := buildMiningConfig()

	tests := []struct {
		name           string
		financials     map[string]float64
		wantScoreMin   float64
		wantScoreMax   float64
		wantRating     string
		wantRatioCount int // expected number of ratios in breakdown
	}{
		{
			name: "all strong — score near 100, strong_buy",
			financials: map[string]float64{
				"pe_ratio":       8,    // strong: < 12
				"debt_to_equity": 0.1,  // strong: < 0.3
				"fcf_yield":      10,   // strong: >= 8
				"roe":            25,   // strong: >= 20
				"ev_ebitda":      3,    // strong: < 5
			},
			wantScoreMin:   99.9,
			wantScoreMax:   100.1,
			wantRating:     "strong_buy",
			wantRatioCount: 5,
		},
		{
			name: "all poor — score near 20, strong_sell",
			financials: map[string]float64{
				"pe_ratio":       50,   // poor: >= 35
				"debt_to_equity": 1.5,  // poor: >= 1.0
				"fcf_yield":      0.5,  // poor: < 1
				"roe":            2,    // poor: < 5
				"ev_ebitda":      20,   // poor: >= 16
			},
			wantScoreMin:   19.9,
			wantScoreMax:   20.1,
			wantRating:     "strong_sell",
			wantRatioCount: 5,
		},
		{
			name: "mixed ratios — some strong, some weak",
			financials: map[string]float64{
				"pe_ratio":       8,    // strong (5 pts, w=0.20)
				"debt_to_equity": 0.8,  // weak (2 pts, w=0.20)
				"fcf_yield":      10,   // strong (5 pts, w=0.25)
				"roe":            7,    // weak (2 pts, w=0.20)
				"ev_ebitda":      3,    // strong (5 pts, w=0.15)
			},
			// weighted sum = (5*0.20 + 2*0.20 + 5*0.25 + 2*0.20 + 5*0.15) = 1.0+0.4+1.25+0.4+0.75 = 3.8
			// score = 3.8 / 5 * 100 = 76
			wantScoreMin:   75.9,
			wantScoreMax:   76.1,
			wantRating:     "buy",
			wantRatioCount: 5,
		},
		{
			name: "negative P/E — no longer excluded, scored normally",
			financials: map[string]float64{
				"pe_ratio":       -5,   // < 12 → strong (5 pts)
				"debt_to_equity": 0.1,  // strong (5 pts)
				"fcf_yield":      10,   // strong (5 pts)
				"roe":            25,   // strong (5 pts)
				"ev_ebitda":      3,    // strong (5 pts)
			},
			// All 5 ratios scored, all strong → score = 100
			wantScoreMin:   99.9,
			wantScoreMax:   100.1,
			wantRating:     "strong_buy",
			wantRatioCount: 5,
		},
		{
			name: "too much missing data — 3 of 5 missing (60% > 40%) → insufficient_data",
			financials: map[string]float64{
				"pe_ratio":       8,    // present
				"debt_to_equity": 0.1,  // present
				// fcf_yield, roe, ev_ebitda missing
			},
			wantScoreMin:   0,
			wantScoreMax:   0,
			wantRating:     "insufficient_data",
			wantRatioCount: 0,
		},
		{
			name: "some missing data under threshold — 1 of 5 missing (20% < 40%)",
			financials: map[string]float64{
				"pe_ratio":       8,    // strong (5 pts)
				"debt_to_equity": 0.1,  // strong (5 pts)
				"fcf_yield":      10,   // strong (5 pts)
				"roe":            25,   // strong (5 pts)
				// ev_ebitda missing (weight 0.15)
			},
			// Missing: ev_ebitda (0.15). Remaining weights: 0.85
			// Scale factor = 1/0.85
			// All strong (5 pts). weighted sum = 5 * 0.85 * (1/0.85) = 5
			// score = 5/5 * 100 = 100
			wantScoreMin:   99.9,
			wantScoreMax:   100.1,
			wantRating:     "strong_buy",
			wantRatioCount: 4,
		},
		{
			name: "boundary values — pe_ratio exactly 12 (boundary between strong max and good min)",
			financials: map[string]float64{
				"pe_ratio":       12,   // max=12 for strong means value < 12, so 12 is NOT strong
				                        // min=12 for good means value >= 12, so 12 IS good (4 pts)
				"debt_to_equity": 0.3,  // max=0.3 for strong means value < 0.3, so 0.3 is NOT strong
				                        // min=0.3 for good means value >= 0.3, so 0.3 IS good (4 pts)
				"fcf_yield":      8,    // min=8 for strong means value >= 8, so 8 IS strong (5 pts)
				"roe":            20,   // min=20 for strong means value >= 20, so 20 IS strong (5 pts)
				"ev_ebitda":      5,    // max=5 for strong means value < 5, so 5 is NOT strong
				                        // min=5 for good means value >= 5, so 5 IS good (4 pts)
			},
			// weighted sum = (4*0.20 + 4*0.20 + 5*0.25 + 5*0.20 + 4*0.15)
			//              = 0.80 + 0.80 + 1.25 + 1.00 + 0.60 = 4.45
			// score = 4.45 / 5 * 100 = 89
			wantScoreMin:   88.9,
			wantScoreMax:   89.1,
			wantRating:     "strong_buy",
			wantRatioCount: 5,
		},
		{
			name: "empty financials — no data at all → insufficient_data",
			financials: map[string]float64{},
			wantScoreMin:   0,
			wantScoreMax:   0,
			wantRating:     "insufficient_data",
			wantRatioCount: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := ScoreCompany(config, tc.financials)
			if err != nil {
				t.Fatalf("ScoreCompany returned error: %v", err)
			}

			if result.Rating == "insufficient_data" {
				if tc.wantRating != "insufficient_data" {
					t.Errorf("got rating %q, want %q", result.Rating, tc.wantRating)
				}
				if len(result.Breakdown.Ratios) != 0 {
					t.Errorf("insufficient_data should have empty breakdown, got %d ratios", len(result.Breakdown.Ratios))
				}
				return
			}

			if result.Rating != tc.wantRating {
				t.Errorf("rating = %q, want %q", result.Rating, tc.wantRating)
			}

			if result.CompositeScore < tc.wantScoreMin || result.CompositeScore > tc.wantScoreMax {
				t.Errorf("composite score = %.2f, want between %.2f and %.2f",
					result.CompositeScore, tc.wantScoreMin, tc.wantScoreMax)
			}

			if len(result.Breakdown.Ratios) != tc.wantRatioCount {
				t.Errorf("breakdown ratio count = %d, want %d", len(result.Breakdown.Ratios), tc.wantRatioCount)
			}
		})
	}
}

func TestScoreCompany_BreakdownDetails(t *testing.T) {
	config := buildMiningConfig()

	financials := map[string]float64{
		"pe_ratio":       8,
		"debt_to_equity": 0.1,
		"fcf_yield":      10,
		"roe":            25,
		"ev_ebitda":      3,
	}

	result, err := ScoreCompany(config, financials)
	if err != nil {
		t.Fatalf("ScoreCompany returned error: %v", err)
	}

	// Verify each ratio result in the breakdown
	expected := map[string]struct {
		value       float64
		bucket      string
		points      int
		weight      float64
	}{
		"pe_ratio":       {8, "strong", 5, 0.20},
		"debt_to_equity": {0.1, "strong", 5, 0.20},
		"fcf_yield":      {10, "strong", 5, 0.25},
		"roe":            {25, "strong", 5, 0.20},
		"ev_ebitda":      {3, "strong", 5, 0.15},
	}

	for _, rr := range result.Breakdown.Ratios {
		exp, ok := expected[rr.Key]
		if !ok {
			t.Errorf("unexpected ratio key in breakdown: %s", rr.Key)
			continue
		}

		if rr.Value != exp.value {
			t.Errorf("%s: value = %f, want %f", rr.Key, rr.Value, exp.value)
		}
		if rr.RangeBucket != exp.bucket {
			t.Errorf("%s: range_bucket = %q, want %q", rr.Key, rr.RangeBucket, exp.bucket)
		}
		if rr.Points != exp.points {
			t.Errorf("%s: points = %d, want %d", rr.Key, rr.Points, exp.points)
		}
		if math.Abs(rr.Weight-exp.weight) > 0.001 {
			t.Errorf("%s: weight = %f, want %f", rr.Key, rr.Weight, exp.weight)
		}
		expectedWeighted := float64(exp.points) * exp.weight
		if math.Abs(rr.WeightedScore-expectedWeighted) > 0.001 {
			t.Errorf("%s: weighted_score = %f, want %f", rr.Key, rr.WeightedScore, expectedWeighted)
		}
	}
}

func TestScoreCompany_Clamping(t *testing.T) {
	// Build a config with MinClamp/MaxClamp on pe_ratio.
	config := buildMiningConfig()
	config.Ratios[0].MinClamp = fp(0)   // clamp PE floor to 0
	config.Ratios[0].MaxClamp = fp(50)  // clamp PE ceiling to 50

	t.Run("value below MinClamp is clamped up", func(t *testing.T) {
		financials := map[string]float64{
			"pe_ratio":       -20,  // below MinClamp 0 → clamped to 0 → strong (< 12)
			"debt_to_equity": 0.1,
			"fcf_yield":      10,
			"roe":            25,
			"ev_ebitda":      3,
		}

		result, err := ScoreCompany(config, financials)
		if err != nil {
			t.Fatalf("ScoreCompany returned error: %v", err)
		}

		// Find pe_ratio in breakdown — value should be clamped to 0
		for _, rr := range result.Breakdown.Ratios {
			if rr.Key == "pe_ratio" {
				if rr.Value != 0 {
					t.Errorf("pe_ratio value = %f, want 0 (clamped)", rr.Value)
				}
				if rr.RangeBucket != "strong" {
					t.Errorf("pe_ratio bucket = %q, want %q", rr.RangeBucket, "strong")
				}
				return
			}
		}
		t.Error("pe_ratio not found in breakdown")
	})

	t.Run("value above MaxClamp is clamped down", func(t *testing.T) {
		financials := map[string]float64{
			"pe_ratio":       200,  // above MaxClamp 50 → clamped to 50 → poor (>= 35)
			"debt_to_equity": 0.1,
			"fcf_yield":      10,
			"roe":            25,
			"ev_ebitda":      3,
		}

		result, err := ScoreCompany(config, financials)
		if err != nil {
			t.Fatalf("ScoreCompany returned error: %v", err)
		}

		for _, rr := range result.Breakdown.Ratios {
			if rr.Key == "pe_ratio" {
				if rr.Value != 50 {
					t.Errorf("pe_ratio value = %f, want 50 (clamped)", rr.Value)
				}
				if rr.RangeBucket != "poor" {
					t.Errorf("pe_ratio bucket = %q, want %q", rr.RangeBucket, "poor")
				}
				return
			}
		}
		t.Error("pe_ratio not found in breakdown")
	})

	t.Run("value within clamp bounds is unchanged", func(t *testing.T) {
		financials := map[string]float64{
			"pe_ratio":       15,  // within [0, 50] → unchanged → good (12-18)
			"debt_to_equity": 0.1,
			"fcf_yield":      10,
			"roe":            25,
			"ev_ebitda":      3,
		}

		result, err := ScoreCompany(config, financials)
		if err != nil {
			t.Fatalf("ScoreCompany returned error: %v", err)
		}

		for _, rr := range result.Breakdown.Ratios {
			if rr.Key == "pe_ratio" {
				if rr.Value != 15 {
					t.Errorf("pe_ratio value = %f, want 15 (unchanged)", rr.Value)
				}
				if rr.RangeBucket != "good" {
					t.Errorf("pe_ratio bucket = %q, want %q", rr.RangeBucket, "good")
				}
				return
			}
		}
		t.Error("pe_ratio not found in breakdown")
	})

	t.Run("no clamp configured leaves value untouched", func(t *testing.T) {
		// Use the base config without clamps
		baseConfig := buildMiningConfig()
		financials := map[string]float64{
			"pe_ratio":       -100, // no clamp → scored as-is → strong (< 12)
			"debt_to_equity": 0.1,
			"fcf_yield":      10,
			"roe":            25,
			"ev_ebitda":      3,
		}

		result, err := ScoreCompany(baseConfig, financials)
		if err != nil {
			t.Fatalf("ScoreCompany returned error: %v", err)
		}

		for _, rr := range result.Breakdown.Ratios {
			if rr.Key == "pe_ratio" {
				if rr.Value != -100 {
					t.Errorf("pe_ratio value = %f, want -100 (no clamp)", rr.Value)
				}
				return
			}
		}
		t.Error("pe_ratio not found in breakdown")
	})
}

func TestScoreCompany_WeightRedistributionMath(t *testing.T) {
	config := buildMiningConfig()

	// Mixed scores with one missing ratio
	financials := map[string]float64{
		"pe_ratio":       50,  // poor (1 pt)
		"debt_to_equity": 0.1, // strong (5 pts)
		"fcf_yield":      10,  // strong (5 pts)
		"roe":            25,  // strong (5 pts)
		// ev_ebitda missing (0.15 weight)
	}

	result, err := ScoreCompany(config, financials)
	if err != nil {
		t.Fatalf("ScoreCompany returned error: %v", err)
	}

	// Remaining weights: 0.20 + 0.20 + 0.25 + 0.20 = 0.85
	// Scale = 1/0.85
	// weighted sum = (1*0.20 + 5*0.20 + 5*0.25 + 5*0.20) / 0.85
	//             = (0.20 + 1.00 + 1.25 + 1.00) / 0.85
	//             = 3.45 / 0.85
	//             ≈ 4.0588...
	// Wait, that's not how it works. Let me recalculate:
	// adjusted_weight_i = original_weight_i / sum_remaining_weights
	// weighted_sum = Σ(points_i × adjusted_weight_i)
	// score = weighted_sum / 5 × 100

	sumRemaining := 0.85
	weightedSum := (1.0*(0.20/sumRemaining) + 5.0*(0.20/sumRemaining) +
		5.0*(0.25/sumRemaining) + 5.0*(0.20/sumRemaining))
	expectedScore := weightedSum / 5.0 * 100.0
	// = (0.2353 + 1.1765 + 1.4706 + 1.1765) / 5 * 100
	// = 4.0588 / 5 * 100
	// = 81.18

	if math.Abs(result.CompositeScore-expectedScore) > 0.1 {
		t.Errorf("composite score = %.2f, want %.2f", result.CompositeScore, expectedScore)
	}
	if result.Rating != "strong_buy" {
		t.Errorf("rating = %q, want %q", result.Rating, "strong_buy")
	}
}
