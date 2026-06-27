/**
 * Atomic "last source wins" transition.
 *
 * All fetch.source jobs for a snapshot call settle() in their `finally` block.
 * Exactly one must enqueue analyze.snapshot — enforced by:
 *   1. `FOR UPDATE` lock on the parent snapshot row.
 *   2. Guarded `UPDATE ... WHERE status IN ('pending','fetching')` that returns
 *      0 rows if another worker already settled.
 *   3. `singletonKey` on enqueueAnalyze as a second line of defense.
 */
import type { PoolClient } from "pg";
import { pool } from "../lib/db";
import { enqueueAnalyze } from "../queue/publish";
import { logger } from "../lib/logger";

type SourceCounts = { pending: number; ok: number; failed: number };

async function countSources(
  client: PoolClient,
  snapshotId: string,
): Promise<SourceCounts> {
  const result = await client.query<{
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

export async function settleSnapshotIfComplete(
  snapshotId: string,
  competitorId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the parent snapshot — prevents concurrent settle calls from racing.
    await client.query(
      `SELECT id FROM competitor_snapshots WHERE id = $1 FOR UPDATE`,
      [snapshotId],
    );

    const counts = await countSources(client, snapshotId);

    if (counts.pending > 0) {
      // Not all sources have resolved — nothing to do yet.
      await client.query("COMMIT");
      return;
    }

    // Determine final snapshot status.
    const newStatus =
      counts.ok > 0 && counts.failed === 0
        ? "completed"
        : counts.ok > 0
          ? "partial"
          : "failed";

    // Guarded update — fires at most once even under concurrent settle calls.
    const updated = await client.query<{ id: string }>(
      `UPDATE competitor_snapshots
       SET status = $2, updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'fetching')
       RETURNING id`,
      [snapshotId, newStatus],
    );

    await client.query("COMMIT");

    if (updated.rows.length === 0) {
      // Another worker already settled this snapshot.
      return;
    }

    logger.info(
      { snapshotId, status: newStatus, ...counts },
      "snapshot settled",
    );

    if (newStatus !== "failed") {
      // singletonKey in enqueueAnalyze is a second guard against double-enqueue.
      await enqueueAnalyze({ snapshotId, competitorId });
      logger.info({ snapshotId }, "analyze.snapshot enqueued");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
