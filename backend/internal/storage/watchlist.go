package storage

import (
	"context"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/google/uuid"
)

func (db *DB) AddToWatchlist(ctx context.Context, userID, companyID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO watchlist_items (user_id, company_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, company_id) DO NOTHING`,
		userID, companyID)
	return err
}

func (db *DB) RemoveFromWatchlist(ctx context.Context, userID, companyID uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`DELETE FROM watchlist_items WHERE user_id = $1 AND company_id = $2`,
		userID, companyID)
	return err
}

func (db *DB) GetWatchlist(ctx context.Context, userID uuid.UUID) ([]models.Company, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT c.id, c.symbol, c.name, c.sector_id, c.market_cap, c.last_updated
		 FROM companies c
		 JOIN watchlist_items w ON w.company_id = c.id
		 WHERE w.user_id = $1
		 ORDER BY w.added_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var companies []models.Company
	for rows.Next() {
		var c models.Company
		if err := rows.Scan(&c.ID, &c.Symbol, &c.Name, &c.SectorID, &c.MarketCap, &c.LastUpdated); err != nil {
			return nil, err
		}
		companies = append(companies, c)
	}
	return companies, rows.Err()
}
