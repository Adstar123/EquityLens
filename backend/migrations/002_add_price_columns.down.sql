ALTER TABLE companies
    DROP COLUMN IF EXISTS last_price,
    DROP COLUMN IF EXISTS price_change,
    DROP COLUMN IF EXISTS price_change_pct,
    DROP COLUMN IF EXISTS price_volume,
    DROP COLUMN IF EXISTS price_prev_close,
    DROP COLUMN IF EXISTS price_updated_at;
