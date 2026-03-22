package storage

import (
	"context"
	"encoding/json"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (db *DB) GetLatestScore(ctx context.Context, companyID uuid.UUID) (*models.Score, error) {
	var s models.Score
	var breakdownBytes []byte

	err := db.Pool.QueryRow(ctx,
		`SELECT id, company_id, sector_config_id, composite_score, rating, breakdown_json, scored_at
		 FROM scores
		 WHERE company_id = $1
		 ORDER BY scored_at DESC
		 LIMIT 1`, companyID).
		Scan(&s.ID, &s.CompanyID, &s.SectorConfigID, &s.CompositeScore, &s.Rating, &breakdownBytes, &s.ScoredAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(breakdownBytes, &s.Breakdown); err != nil {
		return nil, err
	}
	return &s, nil
}

func (db *DB) UpsertScore(ctx context.Context, score models.Score) error {
	breakdownBytes, err := json.Marshal(score.Breakdown)
	if err != nil {
		return err
	}

	_, err = db.Pool.Exec(ctx,
		`INSERT INTO scores (id, company_id, sector_config_id, composite_score, rating, breakdown_json, scored_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (id) DO UPDATE
		 SET composite_score = EXCLUDED.composite_score,
		     rating = EXCLUDED.rating,
		     breakdown_json = EXCLUDED.breakdown_json,
		     scored_at = EXCLUDED.scored_at`,
		score.ID, score.CompanyID, score.SectorConfigID, score.CompositeScore, score.Rating, breakdownBytes, score.ScoredAt)
	return err
}

func (db *DB) ListScreenerItems(ctx context.Context, sectorID *uuid.UUID, minScore float64, limit, offset int) ([]models.ScreenerItem, error) {
	query := `SELECT c.symbol, c.name, sec.key, sec.display_name,
	                  s.composite_score, s.rating, s.breakdown_json, s.scored_at
	           FROM scores s
	           JOIN companies c ON c.id = s.company_id
	           JOIN sectors sec ON sec.id = c.sector_id
	           WHERE s.composite_score >= $1
	           AND s.scored_at = (
	               SELECT MAX(s2.scored_at) FROM scores s2 WHERE s2.company_id = s.company_id
	           )`
	args := []any{minScore}

	if sectorID != nil {
		query += ` AND c.sector_id = $2 ORDER BY s.composite_score DESC LIMIT $3 OFFSET $4`
		args = append(args, *sectorID, limit, offset)
	} else {
		query += ` ORDER BY s.composite_score DESC LIMIT $2 OFFSET $3`
		args = append(args, limit, offset)
	}

	rows, err := db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.ScreenerItem
	for rows.Next() {
		var item models.ScreenerItem
		var breakdownBytes []byte
		if err := rows.Scan(&item.Symbol, &item.CompanyName, &item.SectorKey, &item.SectorName,
			&item.CompositeScore, &item.Rating, &breakdownBytes, &item.ScoredAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(breakdownBytes, &item.Breakdown); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) ListScoresBySector(ctx context.Context, sectorID uuid.UUID, minScore float64, limit, offset int) ([]models.Score, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT s.id, s.company_id, s.sector_config_id, s.composite_score, s.rating, s.breakdown_json, s.scored_at
		 FROM scores s
		 JOIN companies c ON c.id = s.company_id
		 WHERE c.sector_id = $1
		   AND s.composite_score >= $2
		 ORDER BY s.composite_score DESC
		 LIMIT $3 OFFSET $4`, sectorID, minScore, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scores []models.Score
	for rows.Next() {
		var s models.Score
		var breakdownBytes []byte
		if err := rows.Scan(&s.ID, &s.CompanyID, &s.SectorConfigID, &s.CompositeScore, &s.Rating, &breakdownBytes, &s.ScoredAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(breakdownBytes, &s.Breakdown); err != nil {
			return nil, err
		}
		scores = append(scores, s)
	}
	return scores, rows.Err()
}
