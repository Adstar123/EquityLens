package storage

import (
	"context"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (db *DB) ListSectors(ctx context.Context) ([]models.Sector, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, key, display_name, COALESCE(description, '') FROM sectors ORDER BY display_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sectors []models.Sector
	for rows.Next() {
		var s models.Sector
		if err := rows.Scan(&s.ID, &s.Key, &s.DisplayName, &s.Description); err != nil {
			return nil, err
		}
		sectors = append(sectors, s)
	}
	return sectors, rows.Err()
}

func (db *DB) GetSectorByKey(ctx context.Context, key string) (*models.Sector, error) {
	var s models.Sector
	err := db.Pool.QueryRow(ctx,
		`SELECT id, key, display_name, COALESCE(description, '') FROM sectors WHERE key = $1`, key).
		Scan(&s.ID, &s.Key, &s.DisplayName, &s.Description)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

func (db *DB) UpsertSector(ctx context.Context, sector models.Sector) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO sectors (id, key, display_name, description)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (key) DO UPDATE
		 SET display_name = EXCLUDED.display_name,
		     description = EXCLUDED.description`,
		sector.ID, sector.Key, sector.DisplayName, sector.Description)
	return err
}
