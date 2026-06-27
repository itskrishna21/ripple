-- 007: signals — one row per LLM-categorized change within a snapshot.
-- Scores are computed FROM these stored rows so re-scoring history is
-- reproducible even if the prompt or model changes.

CREATE TABLE signals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  UUID        NOT NULL REFERENCES competitor_snapshots(id) ON DELETE CASCADE,
  source_key   TEXT        NOT NULL CHECK (source_key IN ('pricing','changelog','careers','blog')),
  category     TEXT        NOT NULL CHECK (category IN (
                             'pricing_change','new_feature','deprecation',
                             'hiring','funding_or_news','messaging_change','other')),
  change_type  TEXT        NOT NULL CHECK (change_type IN ('added','removed','modified')),
  severity     INT         NOT NULL CHECK (severity BETWEEN 1 AND 5),
  payload      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX signals_snapshot_id_idx ON signals(snapshot_id);
