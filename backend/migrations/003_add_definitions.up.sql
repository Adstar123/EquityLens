CREATE TABLE IF NOT EXISTS definitions (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO definitions (key, label, description) VALUES
    ('composite_score', 'Composite Score', 'A weighted average of all financial ratios, scored from 0-100. Higher is better.'),
    ('rating', 'Rating', 'An overall rating derived from the composite score: Very Strong, Strong, Neutral, Weak, or Very Weak.'),
    ('market_cap', 'Market Cap', 'Total market value of the company''s outstanding shares.'),
    ('price', 'Price', 'The last traded price on the ASX. Updated approximately 4 times daily during trading hours.'),
    ('price_change', 'Price Change', 'The change in price since the previous trading session close.'),
    ('valuation_context', 'Valuation Context', 'Display-only valuation metrics that are not included in the composite score calculation.')
ON CONFLICT (key) DO NOTHING;
