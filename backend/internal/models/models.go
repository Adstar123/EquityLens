package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Name      string    `json:"name" db:"name"`
	Avatar    string    `json:"avatar" db:"avatar"`
	Provider  string    `json:"provider" db:"provider"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Sector struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Key         string    `json:"key" db:"key"`
	DisplayName string    `json:"display_name" db:"display_name"`
	Description string    `json:"description" db:"description"`
}

type Company struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	Symbol      string     `json:"symbol" db:"symbol"`
	Name        string     `json:"name" db:"name"`
	SectorID    *uuid.UUID `json:"sector_id" db:"sector_id"`
	MarketCap   *int64     `json:"market_cap" db:"market_cap"`
	LastUpdated *time.Time `json:"last_updated" db:"last_updated"`
}

type Score struct {
	ID             uuid.UUID `json:"id" db:"id"`
	CompanyID      uuid.UUID `json:"company_id" db:"company_id"`
	SectorConfigID uuid.UUID `json:"sector_config_id" db:"sector_config_id"`
	CompositeScore float64   `json:"composite_score" db:"composite_score"`
	Rating         string    `json:"rating" db:"rating"`
	Breakdown      Breakdown `json:"breakdown" db:"breakdown_json"`
	ScoredAt       time.Time `json:"scored_at" db:"scored_at"`
}

type Breakdown struct {
	Ratios []RatioResult `json:"ratios"`
}

type RatioResult struct {
	Key           string  `json:"key"`
	Name          string  `json:"name"`
	Value         float64 `json:"value"`
	RangeBucket   string  `json:"range_bucket"`
	Points        int     `json:"points"`
	Weight        float64 `json:"weight"`
	WeightedScore float64 `json:"weighted_score"`
}
