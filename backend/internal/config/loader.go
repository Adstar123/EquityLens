package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"github.com/Adstar123/equitylens/backend/internal/models"
)

// LoadSeedConfigs reads all .yaml files from dir and returns parsed SectorConfigs.
func LoadSeedConfigs(dir string) ([]models.SectorConfig, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.yaml"))
	if err != nil {
		return nil, fmt.Errorf("globbing yaml files: %w", err)
	}

	// Also pick up .yml files
	ymlMatches, err := filepath.Glob(filepath.Join(dir, "*.yml"))
	if err != nil {
		return nil, fmt.Errorf("globbing yml files: %w", err)
	}
	matches = append(matches, ymlMatches...)

	// If the directory doesn't exist, filepath.Glob won't error — it just
	// returns no matches. We check explicitly so callers get a clear error.
	if len(matches) == 0 {
		info, statErr := os.Stat(dir)
		if statErr != nil {
			return nil, fmt.Errorf("reading config directory: %w", statErr)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("%s is not a directory", dir)
		}
		// Empty directory — valid, return empty slice.
		return []models.SectorConfig{}, nil
	}

	configs := make([]models.SectorConfig, 0, len(matches))
	for _, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", path, err)
		}

		var cfg models.SectorConfig
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", filepath.Base(path), err)
		}

		configs = append(configs, cfg)
	}

	return configs, nil
}
