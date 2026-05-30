ALTER TABLE competitors
  ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

DELETE FROM competitors WHERE company_id IS NULL;

ALTER TABLE competitors
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX competitors_company_id_idx ON competitors(company_id);
