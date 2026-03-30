package storage

import (
	"context"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (db *DB) SearchCompanies(ctx context.Context, query string, limit int) ([]models.Company, error) {
	pattern := "%" + query + "%"
	rows, err := db.Pool.Query(ctx,
		`SELECT id, symbol, name, sector_id, market_cap, last_updated
		 FROM companies
		 WHERE symbol ILIKE $1 OR name ILIKE $1
		 ORDER BY symbol
		 LIMIT $2`, pattern, limit)
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

func (db *DB) GetCompanyBySymbol(ctx context.Context, symbol string) (*models.Company, error) {
	var c models.Company
	err := db.Pool.QueryRow(ctx,
		`SELECT id, symbol, name, sector_id, market_cap, last_updated
		 FROM companies WHERE symbol = $1`, symbol).
		Scan(&c.ID, &c.Symbol, &c.Name, &c.SectorID, &c.MarketCap, &c.LastUpdated)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (db *DB) UpsertCompany(ctx context.Context, company models.Company) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO companies (id, symbol, name, sector_id, market_cap, last_updated)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (symbol) DO UPDATE
		 SET name = EXCLUDED.name,
		     sector_id = COALESCE(EXCLUDED.sector_id, companies.sector_id),
		     market_cap = COALESCE(EXCLUDED.market_cap, companies.market_cap),
		     last_updated = COALESCE(EXCLUDED.last_updated, companies.last_updated)`,
		company.ID, company.Symbol, company.Name, company.SectorID, company.MarketCap, company.LastUpdated)
	return err
}

func (db *DB) ListCompaniesBySector(ctx context.Context, sectorID uuid.UUID) ([]models.Company, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, symbol, name, sector_id, market_cap, last_updated
		 FROM companies
		 WHERE sector_id = $1
		 ORDER BY symbol`, sectorID)
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
