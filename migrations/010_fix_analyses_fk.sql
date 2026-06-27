-- 010: fix analyses.previous_snapshot_id FK to SET NULL on delete.
-- Without this, deleting a competitor cascades to its competitor_snapshots,
-- which are still referenced by analyses.previous_snapshot_id with RESTRICT
-- (the default), causing the deletion to fail.
-- ON DELETE SET NULL is correct semantics: if the baseline snapshot is removed,
-- the analysis still exists — it just loses its comparison reference.

ALTER TABLE analyses
  DROP CONSTRAINT analyses_previous_snapshot_id_fkey,
  ADD CONSTRAINT analyses_previous_snapshot_id_fkey
    FOREIGN KEY (previous_snapshot_id)
    REFERENCES competitor_snapshots(id)
    ON DELETE SET NULL;
