-- 009: raw HTML blob store (PgBlobStore).
-- storage_key is "{snapshotId}/{sourceKey}" — unique per snapshot+source.
-- Blobs are large; a later migration can move to S3 (same BlobStore interface).

CREATE TABLE snapshot_blobs (
  storage_key TEXT        PRIMARY KEY,
  snapshot_id UUID        NOT NULL REFERENCES competitor_snapshots(id) ON DELETE CASCADE,
  source_key  TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  byte_length INT         GENERATED ALWAYS AS (length(content)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX snapshot_blobs_snapshot_id_idx ON snapshot_blobs(snapshot_id);
