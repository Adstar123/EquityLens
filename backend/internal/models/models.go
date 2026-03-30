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
	Ratios        []RatioResult  `json:"ratios"`
	ContextRatios []ContextRatio `json:"context_ratios,omitempty"`
}

type ContextRatio struct {
	Key   string  `json:"key"`
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

type RatioResult struct {
	Key           string  `json:"key"`
	Name          string  `json:"name"`
	Description   string  `json:"description,omitempty"`
	Value         float64 `json:"value"`
	RangeBucket   string  `json:"range_bucket"`
	Points        int     `json:"points"`
	Weight        float64 `json:"weight"`
	WeightedScore float64 `json:"weighted_score"`
}

// Quote holds real-time price data fetched from ASX.
type Quote struct {
	Symbol    string  `json:"symbol"`
	Price     float64 `json:"price"`
	Change    float64 `json:"change"`
	ChangePct float64 `json:"change_pct"`
	Volume    int64   `json:"volume"`
	MarketCap int64   `json:"market_cap"`
	PrevClose float64 `json:"prev_close"`
	FetchedAt string  `json:"fetched_at"`
}

// Definition is an admin-editable text description for UI elements.
type Definition struct {
	Key         string    `json:"key"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ScreenerItem is an enriched score row with company info for the screener page.
type ScreenerItem struct {
	Symbol         string    `json:"symbol"`
	CompanyName    string    `json:"company_name"`
	SectorKey      string    `json:"sector_key"`
	SectorName     string    `json:"sector_name"`
	CompositeScore float64   `json:"composite_score"`
	Rating         string    `json:"rating"`
	Breakdown      Breakdown `json:"breakdown"`
	ScoredAt       time.Time `json:"scored_at"`
}
