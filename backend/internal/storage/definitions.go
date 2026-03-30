package storage

import (
	"context"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (db *DB) ListDefinitions(ctx context.Context) ([]models.Definition, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT key, label, description, updated_at FROM definitions ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var defs []models.Definition
	for rows.Next() {
		var d models.Definition
		if err := rows.Scan(&d.Key, &d.Label, &d.Description, &d.UpdatedAt); err != nil {
			return nil, err
		}
		defs = append(defs, d)
	}
	return defs, rows.Err()
}

func (db *DB) UpsertDefinition(ctx context.Context, def models.Definition) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO definitions (key, label, description, updated_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (key) DO UPDATE
		 SET label = EXCLUDED.label,
		     description = EXCLUDED.description,
		     updated_at = EXCLUDED.updated_at`,
		def.Key, def.Label, def.Description, time.Now())
	return err
}

func (db *DB) GetDefinition(ctx context.Context, key string) (*models.Definition, error) {
	var d models.Definition
	err := db.Pool.QueryRow(ctx,
		`SELECT key, label, description, updated_at FROM definitions WHERE key = $1`, key).
		Scan(&d.Key, &d.Label, &d.Description, &d.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &d, nil
}
