import { config } from "../config";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { getWeekStart } from "../lib/week";
import { getBoss, stopBoss } from "../queue/boss";
import { enqueueSnapshotStart } from "../queue/publish";

// ---------------------------------------------------------------------------
// Weekly snapshot fan-out
// ---------------------------------------------------------------------------

export async function runWeeklyEnqueue(): Promise<void> {
  const weekStart = getWeekStart();
  const log = logger.child({ weekStart });
  log.info({}, "weekly enqueue starting");

  // Query all active competitors across all companies.
  // Workers run in system context; no company_id scope here.
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM competitors ORDER BY id",
  );

  let enqueued = 0;
  for (const row of result.rows) {
    await enqueueSnapshotStart({ competitorId: row.id, weekStart });
    enqueued++;
  }

  log.info({ enqueued }, "weekly enqueue complete");
}

// ---------------------------------------------------------------------------
// Reaper (stub — Phase 5 fills in src/pipeline/reaper.ts)
// ---------------------------------------------------------------------------

async function runReaper(): Promise<void> {
  logger.info({}, "reaper tick");
  // TODO: Phase 5 — import and call runReaper() from src/pipeline/reaper.ts
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function startScheduler(): Promise<void> {
  // pg-boss must be started to use its cron/send APIs; scheduler itself
  // doesn't consume jobs, but publish helpers need the boss connection.
  await getBoss();

  // Run the weekly enqueue immediately on start if it's Monday (UTC), then
  // again every week via setInterval. In production this process would
  // typically be triggered by a cron job / Cloud Scheduler; the in-process
  // interval is a simple fallback for single-host deployments.
  await runWeeklyEnqueue().catch((err) =>
    logger.error({ err }, "weekly enqueue failed"),
  );

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeklyTimer = setInterval(() => {
    void runWeeklyEnqueue().catch((err) =>
      logger.error({ err }, "weekly enqueue failed"),
    );
  }, weekMs);

  // Reaper runs on a short interval to sweep stuck snapshots.
  const reaperTimer = setInterval(() => {
    void runReaper().catch((err) =>
      logger.error({ err }, "reaper tick failed"),
    );
  }, config.REAPER_INTERVAL_MS);

  logger.info(
    { reaperIntervalMs: config.REAPER_INTERVAL_MS },
    "scheduler process started",
  );

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    clearInterval(weeklyTimer);
    clearInterval(reaperTimer);
    await stopBoss();
    await pool.end();
    logger.info({}, "scheduler process shut down");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
