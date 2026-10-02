-- 011: weekly vs biweekly digest subscription on the company (tenant).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS digest_cadence TEXT NOT NULL DEFAULT 'weekly'
    CHECK (digest_cadence IN ('weekly', 'biweekly'));
