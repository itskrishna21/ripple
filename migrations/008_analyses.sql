-- 008: analyses — one row per snapshot, written after all signals are stored.
-- threat_score is deterministic over the stored signals (see score.ts).
-- Provenance columns allow comparing analyses across categorization runs.

CREATE TABLE analyses (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id          UUID        NOT NULL UNIQUE
                                    REFERENCES competitor_snapshots(id) ON DELETE CASCADE,
  previous_snapshot_id UUID        REFERENCES competitor_snapshots(id),
  threat_score         INT         NOT NULL CHECK (threat_score BETWEEN 0 AND 100),
  score_breakdown      JSONB       NOT NULL DEFAULT '{}',
  summary              TEXT        NOT NULL,
  model                TEXT        NOT NULL,
  prompt_version       TEXT        NOT NULL,
  policy_version       TEXT        NOT NULL,
  is_baseline          BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX analyses_snapshot_id_idx ON analyses(snapshot_id);
