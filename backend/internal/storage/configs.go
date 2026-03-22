package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type SectorConfigRow struct {
	ID          uuid.UUID           `json:"id" db:"id"`
	SectorID    uuid.UUID           `json:"sector_id" db:"sector_id"`
	Version     int                 `json:"version" db:"version"`
	ConfigJSON  models.SectorConfig `json:"config_json"`
	IsActive    bool                `json:"is_active" db:"is_active"`
	PublishedAt *time.Time          `json:"published_at" db:"published_at"`
	CreatedBy   *uuid.UUID          `json:"created_by" db:"created_by"`
	CreatedAt   time.Time           `json:"created_at" db:"created_at"`
}

func (db *DB) GetActiveConfig(ctx context.Context, sectorID uuid.UUID) (*SectorConfigRow, error) {
	var row SectorConfigRow
	var configBytes []byte

	err := db.Pool.QueryRow(ctx,
		`SELECT id, sector_id, version, config_json, is_active, published_at, created_by, created_at
		 FROM sector_configs
		 WHERE sector_id = $1 AND is_active = true`, sectorID).
		Scan(&row.ID, &row.SectorID, &row.Version, &configBytes, &row.IsActive, &row.PublishedAt, &row.CreatedBy, &row.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(configBytes, &row.ConfigJSON); err != nil {
		return nil, fmt.Errorf("unmarshal config_json: %w", err)
	}
	return &row, nil
}

func (db *DB) SaveConfig(ctx context.Context, config SectorConfigRow) error {
	configBytes, err := json.Marshal(config.ConfigJSON)
	if err != nil {
		return fmt.Errorf("marshal config_json: %w", err)
	}

	_, err = db.Pool.Exec(ctx,
		`INSERT INTO sector_configs (id, sector_id, version, config_json, is_active, published_at, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		config.ID, config.SectorID, config.Version, configBytes, config.IsActive, config.PublishedAt, config.CreatedBy)
	return err
}

func (db *DB) PublishConfig(ctx context.Context, configID uuid.UUID) error {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Find the sector_id for the config being published
	var sectorID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT sector_id FROM sector_configs WHERE id = $1`, configID).
		Scan(&sectorID)
	if err != nil {
		return fmt.Errorf("find config: %w", err)
	}

	// Deactivate any currently active config for the same sector
	_, err = tx.Exec(ctx,
		`UPDATE sector_configs SET is_active = false
		 WHERE sector_id = $1 AND is_active = true`, sectorID)
	if err != nil {
		return fmt.Errorf("deactivate configs: %w", err)
	}

	// Activate the target config and set published_at
	_, err = tx.Exec(ctx,
		`UPDATE sector_configs SET is_active = true, published_at = NOW()
		 WHERE id = $1`, configID)
	if err != nil {
		return fmt.Errorf("activate config: %w", err)
	}

	return tx.Commit(ctx)
}

func (db *DB) ListConfigVersions(ctx context.Context, sectorID uuid.UUID) ([]SectorConfigRow, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, sector_id, version, config_json, is_active, published_at, created_by, created_at
		 FROM sector_configs
		 WHERE sector_id = $1
		 ORDER BY version DESC`, sectorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var configs []SectorConfigRow
	for rows.Next() {
		var row SectorConfigRow
		var configBytes []byte
		if err := rows.Scan(&row.ID, &row.SectorID, &row.Version, &configBytes, &row.IsActive, &row.PublishedAt, &row.CreatedBy, &row.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(configBytes, &row.ConfigJSON); err != nil {
			return nil, fmt.Errorf("unmarshal config_json: %w", err)
		}
		configs = append(configs, row)
	}
	return configs, rows.Err()
}
