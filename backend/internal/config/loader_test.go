package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadSeedConfigs_ValidYAML(t *testing.T) {
	dir := t.TempDir()

	yaml := `
sector: mining
display_name: "Mining & Resources"
ratios:
  - key: pe_ratio
    name: "P/E Ratio"
    weight: 0.60
    lower_is_better: true
    ranges:
      strong: { max: 12 }
      good: { min: 12, max: 18 }
      neutral: { min: 18, max: 25 }
      weak: { min: 25, max: 35 }
      poor: { min: 35 }
  - key: debt_to_equity
    name: "Debt to Equity"
    weight: 0.40
    lower_is_better: true
    ranges:
      strong: { max: 0.3 }
      good: { min: 0.3, max: 0.5 }
      neutral: { min: 0.5, max: 0.7 }
      weak: { min: 0.7, max: 1.0 }
      poor: { min: 1.0 }
edge_cases:
  negative_earnings: "exclude_pe_redistribute"
  missing_data_threshold: 0.4
rating_scale:
  strong_buy: { min: 80 }
  buy: { min: 65, max: 80 }
  hold: { min: 45, max: 65 }
  sell: { min: 30, max: 45 }
  strong_sell: { max: 30 }
`
	err := os.WriteFile(filepath.Join(dir, "mining.yaml"), []byte(yaml), 0644)
	if err != nil {
		t.Fatal(err)
	}

	configs, err := LoadSeedConfigs(dir)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(configs) != 1 {
		t.Fatalf("expected 1 config, got %d", len(configs))
	}

	cfg := configs[0]

	if cfg.Sector != "mining" {
		t.Errorf("expected sector 'mining', got %q", cfg.Sector)
	}
	if cfg.DisplayName != "Mining & Resources" {
		t.Errorf("expected display_name 'Mining & Resources', got %q", cfg.DisplayName)
	}
	if len(cfg.Ratios) != 2 {
		t.Fatalf("expected 2 ratios, got %d", len(cfg.Ratios))
	}

	// Check first ratio
	pe := cfg.Ratios[0]
	if pe.Key != "pe_ratio" {
		t.Errorf("expected key 'pe_ratio', got %q", pe.Key)
	}
	if pe.Weight != 0.60 {
		t.Errorf("expected weight 0.60, got %f", pe.Weight)
	}
	if !pe.LowerIsBetter {
		t.Error("expected lower_is_better true for pe_ratio")
	}
	if pe.Ranges.Strong.Max == nil || *pe.Ranges.Strong.Max != 12 {
		t.Error("expected strong max 12 for pe_ratio")
	}
	if pe.Ranges.Strong.Min != nil {
		t.Error("expected strong min nil for pe_ratio")
	}
	if pe.Ranges.Poor.Min == nil || *pe.Ranges.Poor.Min != 35 {
		t.Error("expected poor min 35 for pe_ratio")
	}

	// Check second ratio
	de := cfg.Ratios[1]
	if de.Key != "debt_to_equity" {
		t.Errorf("expected key 'debt_to_equity', got %q", de.Key)
	}
	if de.Weight != 0.40 {
		t.Errorf("expected weight 0.40, got %f", de.Weight)
	}

	// Check edge cases
	if cfg.EdgeCases.NegativeEarnings != "exclude_pe_redistribute" {
		t.Errorf("expected negative_earnings 'exclude_pe_redistribute', got %q", cfg.EdgeCases.NegativeEarnings)
	}
	if cfg.EdgeCases.MissingDataThreshold != 0.4 {
		t.Errorf("expected missing_data_threshold 0.4, got %f", cfg.EdgeCases.MissingDataThreshold)
	}

	// Check rating scale
	if cfg.RatingScale.StrongBuy.Min == nil || *cfg.RatingScale.StrongBuy.Min != 80 {
		t.Error("expected strong_buy min 80")
	}
	if cfg.RatingScale.StrongSell.Max == nil || *cfg.RatingScale.StrongSell.Max != 30 {
		t.Error("expected strong_sell max 30")
	}
}

func TestLoadSeedConfigs_MiningYAMLFile(t *testing.T) {
	// Test against the actual mining.yaml seed file
	dir := filepath.Join("..", "..", "configs", "sectors")
	configs, err := LoadSeedConfigs(dir)
	if err != nil {
		t.Fatalf("failed to load mining.yaml: %v", err)
	}

	if len(configs) < 1 {
		t.Fatal("expected at least 1 config from sectors dir")
	}

	// Find mining config
	miningCfg := -1
	for i, c := range configs {
		if c.Sector == "mining" {
			miningCfg = i
			break
		}
	}

	if miningCfg == -1 {
		t.Fatal("mining config not found")
	}

	cfg := configs[miningCfg]

	if cfg.DisplayName != "Mining & Resources" {
		t.Errorf("expected display_name 'Mining & Resources', got %q", cfg.DisplayName)
	}
	if len(cfg.Ratios) != 5 {
		t.Errorf("expected 5 ratios, got %d", len(cfg.Ratios))
	}

	// Verify weights sum to 1.0
	var totalWeight float64
	for _, r := range cfg.Ratios {
		totalWeight += r.Weight
	}
	if totalWeight < 0.99 || totalWeight > 1.01 {
		t.Errorf("expected weights to sum to ~1.0, got %f", totalWeight)
	}

	// Verify specific ratio values
	for _, r := range cfg.Ratios {
		switch r.Key {
		case "pe_ratio":
			if r.Weight != 0.20 {
				t.Errorf("pe_ratio weight: expected 0.20, got %f", r.Weight)
			}
			if r.Ranges.Strong.Max == nil || *r.Ranges.Strong.Max != 12 {
				t.Error("pe_ratio strong max should be 12")
			}
		case "fcf_yield":
			if r.Weight != 0.25 {
				t.Errorf("fcf_yield weight: expected 0.25, got %f", r.Weight)
			}
			if r.LowerIsBetter {
				t.Error("fcf_yield should not be lower_is_better")
			}
			if r.Ranges.Strong.Min == nil || *r.Ranges.Strong.Min != 8 {
				t.Error("fcf_yield strong min should be 8")
			}
		case "ev_ebitda":
			if r.Weight != 0.15 {
				t.Errorf("ev_ebitda weight: expected 0.15, got %f", r.Weight)
			}
		}
	}
}

func TestLoadSeedConfigs_EmptyDirectory(t *testing.T) {
	dir := t.TempDir()

	configs, err := LoadSeedConfigs(dir)
	if err != nil {
		t.Fatalf("expected no error for empty dir, got %v", err)
	}
	if len(configs) != 0 {
		t.Errorf("expected empty slice, got %d configs", len(configs))
	}
}

func TestLoadSeedConfigs_InvalidYAML(t *testing.T) {
	dir := t.TempDir()

	invalidYAML := `
sector: bad
ratios:
  - this is not valid yaml: [[[
    broken: {{{
`
	err := os.WriteFile(filepath.Join(dir, "bad.yaml"), []byte(invalidYAML), 0644)
	if err != nil {
		t.Fatal(err)
	}

	_, err = LoadSeedConfigs(dir)
	if err == nil {
		t.Fatal("expected error for invalid YAML, got nil")
	}
}

func TestLoadSeedConfigs_NonexistentDirectory(t *testing.T) {
	_, err := LoadSeedConfigs("/nonexistent/path/that/does/not/exist")
	if err == nil {
		t.Fatal("expected error for nonexistent directory, got nil")
	}
}

func TestLoadSeedConfigs_MultipleFiles(t *testing.T) {
	dir := t.TempDir()

	yaml1 := `
sector: mining
display_name: "Mining"
ratios:
  - key: pe_ratio
    name: "P/E Ratio"
    weight: 1.0
    lower_is_better: true
    ranges:
      strong: { max: 12 }
      good: { min: 12, max: 18 }
      neutral: { min: 18, max: 25 }
      weak: { min: 25, max: 35 }
      poor: { min: 35 }
edge_cases:
  negative_earnings: "skip"
  missing_data_threshold: 0.5
rating_scale:
  strong_buy: { min: 80 }
  buy: { min: 60, max: 80 }
  hold: { min: 40, max: 60 }
  sell: { min: 20, max: 40 }
  strong_sell: { max: 20 }
`
	yaml2 := `
sector: tech
display_name: "Technology"
ratios:
  - key: pe_ratio
    name: "P/E Ratio"
    weight: 1.0
    lower_is_better: true
    ranges:
      strong: { max: 20 }
      good: { min: 20, max: 30 }
      neutral: { min: 30, max: 40 }
      weak: { min: 40, max: 50 }
      poor: { min: 50 }
edge_cases:
  negative_earnings: "skip"
  missing_data_threshold: 0.5
rating_scale:
  strong_buy: { min: 80 }
  buy: { min: 60, max: 80 }
  hold: { min: 40, max: 60 }
  sell: { min: 20, max: 40 }
  strong_sell: { max: 20 }
`
	os.WriteFile(filepath.Join(dir, "mining.yaml"), []byte(yaml1), 0644)
	os.WriteFile(filepath.Join(dir, "tech.yaml"), []byte(yaml2), 0644)
	// This non-yaml file should be ignored
	os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("not yaml"), 0644)

	configs, err := LoadSeedConfigs(dir)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("expected 2 configs, got %d", len(configs))
	}

	sectors := map[string]bool{}
	for _, c := range configs {
		sectors[c.Sector] = true
	}
	if !sectors["mining"] || !sectors["tech"] {
		t.Error("expected both mining and tech sectors")
	}
}
