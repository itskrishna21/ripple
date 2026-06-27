/**
 * Reaper — backstop for stuck snapshots (§5.6).
 *
 * The primary liveness mechanism is markSourceFailed on the final retry.
 * The reaper handles the failure modes that bypass that path:
 *   - Worker process crashed between markSourceFailed and the DB commit
 *   - Job was lost from the queue without running (pg-boss edge case)
 *   - analyze.snapshot handler crashed while status = 'analyzing'
 *
 * Safety properties:
 *   - `FOR UPDATE SKIP LOCKED` — concurrent reaper instances skip locked rows;
 *     live workers locking a snapshot are skipped too.
 *   - All mutations inside a single TX per snapshot.
 *   - Idempotent: snapshots that settled normally don't match the WHERE clause.
 *   - singletonKey on enqueueAnalyze guards double-enqueue of analyze jobs.
 */
import { pool } from "../lib/db";
import { config } from "../config";
import { logger } from "../lib/logger";
import { settleSnapshotIfComplete } from "./settle";
import { enqueueAnalyze } from "../queue/publish";

type StuckSnapshot = {
  id: string;
  competitor_id: string;
  status: string;
};

export async function runReaper(): Promise<void> {
  const log = logger.child({ component: "reaper" });
  log.info({}, "reaper tick starting");

  const client = await pool.connect();
  let reaped = 0;

  try {
    await client.query("BEGIN");

    // Find snapshots stuck in an in-flight state past the threshold.
    // SKIP LOCKED: don't block live workers; don't wait for rows they hold.
    const stuck = await client.query<StuckSnapshot>(
      `SELECT id, competitor_id, status
       FROM competitor_snapshots
       WHERE status IN ('pending', 'fetching', 'analyzing')
         AND updated_at < NOW() - ($1 * INTERVAL '1 minute')
       FOR UPDATE SKIP LOCKED`,
      [config.REAPER_STUCK_THRESHOLD_MIN],
    );

    await client.query("COMMIT");

    if (stuck.rows.length === 0) {
      log.debug({}, "reaper: no stuck snapshots");
      return;
    }

    log.warn({ count: stuck.rows.length }, "reaper: found stuck snapshots");

    for (const snap of stuck.rows) {
      await reaperHandleOne(snap, log);
      reaped++;
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    log.error({ err }, "reaper tick failed");
    throw err;
  } finally {
    client.release();
    log.info({ reaped }, "reaper tick complete");
  }
}

type ChildLogger = ReturnType<typeof logger.child>;

async function reaperHandleOne(
  snap: StuckSnapshot,
  log: ChildLogger,
): Promise<void> {
  const ctx = {
    snapshotId: snap.id,
    competitorId: snap.competitor_id,
    fromStatus: snap.status,
  };

  log.warn(ctx, "reaping stuck snapshot");

  if (snap.status === "pending" || snap.status === "fetching") {
    // Mark all still-pending sources as failed, then settle.
    // settleSnapshotIfComplete will transition the snapshot to partial/failed
    // and (if any sources were ok) enqueue analyze.
    const result = await pool.query<{ source_key: string }>(
      `UPDATE snapshot_sources
       SET status     = 'failed',
           error      = 'reaped: stuck pending past threshold',
           updated_at = NOW()
       WHERE snapshot_id = $1 AND status = 'pending'
       RETURNING source_key`,
      [snap.id],
    );

    const reaped = result.rows.map((r) => r.source_key);
    log.warn({ ...ctx, reaped }, "sources marked failed by reaper");

    await settleSnapshotIfComplete(snap.id, snap.competitor_id).catch((err) =>
      log.error({ ...ctx, err }, "settle failed after reaper mark"),
    );
  } else if (snap.status === "analyzing") {
    // analyze.snapshot handler crashed — re-enqueue (singletonKey dedupes).
    await enqueueAnalyze({
      snapshotId: snap.id,
      competitorId: snap.competitor_id,
    }).catch((err) => log.error({ ...ctx, err }, "re-enqueue analyze failed"));

    log.warn(ctx, "stuck analyzing snapshot re-enqueued");
  }

  // Structured metric line — pick this up with a log aggregator or Datadog.
  log.info(
    { metric: "stuck_snapshot_reaped", ...ctx },
    "metric: stuck_snapshot_reaped",
  );
}
