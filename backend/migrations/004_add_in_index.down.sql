DROP INDEX IF EXISTS idx_companies_in_index;

ALTER TABLE companies DROP COLUMN IF EXISTS in_index;
