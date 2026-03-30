package storage

import (
	"context"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

// GetPrice fetches price data for a single symbol from the companies table.
func (db *DB) GetPrice(ctx context.Context, symbol string) (*models.Quote, error) {
	var q models.Quote
	var updatedAt *time.Time

	err := db.Pool.QueryRow(ctx,
		`SELECT symbol, last_price, price_change, price_change_pct, price_volume, market_cap, price_prev_close, price_updated_at
		 FROM companies
		 WHERE symbol = $1 AND last_price IS NOT NULL`, symbol).
		Scan(&q.Symbol, &q.Price, &q.Change, &q.ChangePct, &q.Volume, &q.MarketCap, &q.PrevClose, &updatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if updatedAt != nil {
		q.FetchedAt = updatedAt.UTC().Format(time.RFC3339)
	}
	return &q, nil
}

// GetPrices fetches price data for multiple symbols.
func (db *DB) GetPrices(ctx context.Context, symbols []string) (map[string]*models.Quote, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT symbol, last_price, price_change, price_change_pct, price_volume, market_cap, price_prev_close, price_updated_at
		 FROM companies
		 WHERE symbol = ANY($1) AND last_price IS NOT NULL`, symbols)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]*models.Quote)
	for rows.Next() {
		var q models.Quote
		var updatedAt *time.Time
		if err := rows.Scan(&q.Symbol, &q.Price, &q.Change, &q.ChangePct, &q.Volume, &q.MarketCap, &q.PrevClose, &updatedAt); err != nil {
			return nil, err
		}
		if updatedAt != nil {
			q.FetchedAt = updatedAt.UTC().Format(time.RFC3339)
		}
		result[q.Symbol] = &q
	}
	return result, rows.Err()
}

// ListAllSymbols returns all company symbols in the database.
func (db *DB) ListAllSymbols(ctx context.Context) ([]string, error) {
	rows, err := db.Pool.Query(ctx, `SELECT symbol FROM companies ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var symbols []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		symbols = append(symbols, s)
	}
	return symbols, rows.Err()
}

// UpdatePrice updates price columns for a single company.
func (db *DB) UpdatePrice(ctx context.Context, symbol string, price, change, changePct, prevClose float64, volume, marketCap int64) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE companies
		 SET last_price = $2, price_change = $3, price_change_pct = $4,
		     price_volume = $5, market_cap = $6, price_prev_close = $7,
		     price_updated_at = NOW()
		 WHERE symbol = $1`,
		symbol, price, change, changePct, volume, marketCap, prevClose)
	return err
}
