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
