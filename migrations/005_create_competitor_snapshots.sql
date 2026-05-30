CREATE TABLE competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sources JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competitor_id, week_start)
);

CREATE INDEX competitor_snapshots_competitor_id_idx
  ON competitor_snapshots(competitor_id);

CREATE INDEX competitor_snapshots_week_start_idx
  ON competitor_snapshots(week_start);
