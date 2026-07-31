ALTER TABLE companies ADD COLUMN in_index BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_companies_in_index ON companies(in_index) WHERE in_index = true;
