-- 006: introduce per-source rows, superseding the JSONB blob on competitor_snapshots.
-- Step 1 (schema): create snapshot_sources.
-- Step 2 (backfill): expand existing JSONB rows idempotently.
-- Step 3: the app reads from snapshot_sources; the sources JSONB column is kept for
--         rollback safety and removed in a later migration.

CREATE TABLE snapshot_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID        NOT NULL REFERENCES competitor_snapshots(id) ON DELETE CASCADE,
  source_key  TEXT        NOT NULL CHECK (source_key IN ('pricing','changelog','careers','blog')),
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  content_hash TEXT,
  storage_key  TEXT,
  normalized   TEXT,
  error        TEXT,
  fetched_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, source_key)
);

CREATE INDEX snapshot_sources_snapshot_id_idx ON snapshot_sources(snapshot_id);

-- Backfill: expand existing JSONB sources blobs into rows.
-- Historical rows lack content_hash / storage_key (never stored) — that is fine;
-- the cold-start rule (§8.4) treats a missing baseline as a new source.
INSERT INTO snapshot_sources (snapshot_id, source_key, status)
SELECT s.id,
       kv.key,
       CASE kv.value->>'status'
         WHEN 'ok'     THEN 'ok'
         WHEN 'failed' THEN 'failed'
         ELSE 'pending'
       END
FROM   competitor_snapshots s
CROSS  JOIN LATERAL jsonb_each(s.sources) AS kv(key, value)
WHERE  kv.key IN ('pricing','changelog','careers','blog')
ON CONFLICT (snapshot_id, source_key) DO NOTHING;
