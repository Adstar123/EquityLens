CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE sector_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sector_id UUID NOT NULL REFERENCES sectors(id),
    version INT NOT NULL,
    config_json JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sector_id, version)
);

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sector_id UUID REFERENCES sectors(id),
    market_cap BIGINT,
    last_updated TIMESTAMPTZ
);

CREATE TABLE financials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    period TEXT NOT NULL,
    period_type TEXT NOT NULL,
    data_json JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, period)
);

CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    sector_config_id UUID NOT NULL REFERENCES sector_configs(id),
    composite_score DECIMAL(5,2) NOT NULL,
    rating TEXT NOT NULL,
    breakdown_json JSONB NOT NULL,
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, company_id)
);

CREATE INDEX idx_scores_company ON scores(company_id);
CREATE INDEX idx_scores_scored_at ON scores(scored_at DESC);
CREATE INDEX idx_financials_company ON financials(company_id);
CREATE INDEX idx_sector_configs_active ON sector_configs(sector_id, is_active) WHERE is_active = true;
CREATE INDEX idx_watchlist_user ON watchlist_items(user_id);
CREATE INDEX idx_companies_sector ON companies(sector_id);
CREATE INDEX idx_companies_symbol ON companies(symbol);
