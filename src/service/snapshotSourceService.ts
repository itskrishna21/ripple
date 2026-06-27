/**
 * Data-access layer for snapshot_sources and competitor_snapshots.
 * Workers run in system context — no company_id scoping here.
 */
import { pool } from "../lib/db";
import { TrackedSourceKey, SnapshotStatus } from "../schema/snapshot";

// ---------------------------------------------------------------------------
// Competitor source URLs
// ---------------------------------------------------------------------------

export type SourceUrl = { key: TrackedSourceKey; url: string };

type CompetitorUrlRow = {
  pricing_url: string | null;
  changelog_url: string | null;
  careers_url: string | null;
  blog_url: string | null;
};

/** Returns all non-null source URLs for a competitor (system context). */
export async function getCompetitorSourceUrls(
  competitorId: string,
): Promise<SourceUrl[]> {
  const result = await pool.query<CompetitorUrlRow>(
    `SELECT pricing_url, changelog_url, careers_url, blog_url
     FROM competitors WHERE id = $1`,
    [competitorId],
  );
  const row = result.rows[0];
  if (!row) return [];

  const sources: SourceUrl[] = [];
  if (row.pricing_url) sources.push({ key: "pricing", url: row.pricing_url });
  if (row.changelog_url)
    sources.push({ key: "changelog", url: row.changelog_url });
  if (row.careers_url) sources.push({ key: "careers", url: row.careers_url });
  if (row.blog_url) sources.push({ key: "blog", url: row.blog_url });
  return sources;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export type SnapshotRow = {
  id: string;
  competitor_id: string;
  week_start: Date;
  status: SnapshotStatus;
};

/**
 * Upserts a snapshot row for (competitorId, weekStart).
 * On conflict (e.g. duplicate job) it touches updated_at and returns the
 * existing row so the handler can proceed idempotently.
 */
export async function upsertSnapshot(
  competitorId: string,
  weekStart: string,
): Promise<SnapshotRow> {
  const result = await pool.query<SnapshotRow>(
    `INSERT INTO competitor_snapshots (competitor_id, week_start, status, sources)
     VALUES ($1, $2, 'pending', '{}')
     ON CONFLICT (competitor_id, week_start)
     DO UPDATE SET updated_at = NOW()
     RETURNING id, competitor_id, week_start, status`,
    [competitorId, weekStart],
  );
  return result.rows[0]!;
}

export async function setSnapshotStatus(
  snapshotId: string,
  status: SnapshotStatus,
): Promise<void> {
  await pool.query(
    `UPDATE competitor_snapshots SET status = $2, updated_at = NOW() WHERE id = $1`,
    [snapshotId, status],
  );
}

// ---------------------------------------------------------------------------
// Snapshot sources
// ---------------------------------------------------------------------------

type SnapshotSourceRow = {
  id: string;
  snapshot_id: string;
  source_key: TrackedSourceKey;
  status: "pending" | "ok" | "failed";
  content_hash: string | null;
  storage_key: string | null;
  normalized: string | null;
  error: string | null;
  fetched_at: Date | null;
};

export type SnapshotSource = {
  id: string;
  snapshotId: string;
  sourceKey: TrackedSourceKey;
  status: "pending" | "ok" | "failed";
  contentHash: string | null;
  storageKey: string | null;
  normalized: string | null;
  error: string | null;
};

function rowToSource(row: SnapshotSourceRow): SnapshotSource {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    sourceKey: row.source_key,
    status: row.status,
    contentHash: row.content_hash,
    storageKey: row.storage_key,
    normalized: row.normalized,
    error: row.error,
  };
}

/**
 * Inserts a pending source row. ON CONFLICT DO NOTHING makes the handler
 * idempotent — a retried snapshot.start job won't duplicate rows.
 */
export async function insertSource(
  snapshotId: string,
  sourceKey: TrackedSourceKey,
): Promise<void> {
  await pool.query(
    `INSERT INTO snapshot_sources (snapshot_id, source_key, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (snapshot_id, source_key) DO NOTHING`,
    [snapshotId, sourceKey],
  );
}

export async function markSourceOk(
  snapshotId: string,
  sourceKey: TrackedSourceKey,
  data: { contentHash: string; storageKey: string; normalized: string },
): Promise<void> {
  await pool.query(
    `UPDATE snapshot_sources
     SET status       = 'ok',
         content_hash = $3,
         storage_key  = $4,
         normalized   = $5,
         fetched_at   = NOW(),
         updated_at   = NOW()
     WHERE snapshot_id = $1 AND source_key = $2`,
    [snapshotId, sourceKey, data.contentHash, data.storageKey, data.normalized],
  );
}

export async function markSourceFailed(
  snapshotId: string,
  sourceKey: TrackedSourceKey,
  error: string,
): Promise<void> {
  await pool.query(
    `UPDATE snapshot_sources
     SET status     = 'failed',
         error      = $3,
         fetched_at = NOW(),
         updated_at = NOW()
     WHERE snapshot_id = $1 AND source_key = $2`,
    [snapshotId, sourceKey, error],
  );
}

export type SourceCounts = { pending: number; ok: number; failed: number };

export async function countSourceStatuses(
  snapshotId: string,
): Promise<SourceCounts> {
  const result = await pool.query<{
    pending: string;
    ok: string;
    failed: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE status = 'pending') AS pending,
       count(*) FILTER (WHERE status = 'ok')      AS ok,
       count(*) FILTER (WHERE status = 'failed')  AS failed
     FROM snapshot_sources WHERE snapshot_id = $1`,
    [snapshotId],
  );
  const row = result.rows[0] ?? { pending: "0", ok: "0", failed: "0" };
  return {
    pending: Number(row.pending),
    ok: Number(row.ok),
    failed: Number(row.failed),
  };
}

export async function getSourcesForSnapshot(
  snapshotId: string,
): Promise<SnapshotSource[]> {
  const result = await pool.query<SnapshotSourceRow>(
    `SELECT id, snapshot_id, source_key, status, content_hash,
            storage_key, normalized, error, fetched_at
     FROM snapshot_sources WHERE snapshot_id = $1`,
    [snapshotId],
  );
  return result.rows.map(rowToSource);
}
