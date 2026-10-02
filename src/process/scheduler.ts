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

// Reaper is imported here; the function itself lives in pipeline/reaper.ts
// so it can be unit-tested without bringing up the full scheduler.
import { runReaper } from "../pipeline/reaper";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function startSchedulerLoops(): Promise<() => void> {
  await getBoss();

  await runWeeklyEnqueue().catch((err) =>
    logger.error({ err }, "weekly enqueue failed"),
  );

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeklyTimer = setInterval(() => {
    void runWeeklyEnqueue().catch((err) =>
      logger.error({ err }, "weekly enqueue failed"),
    );
  }, weekMs);

  const reaperTimer = setInterval(() => {
    void runReaper().catch((err) =>
      logger.error({ err }, "reaper tick failed"),
    );
  }, config.REAPER_INTERVAL_MS);

  logger.info(
    { reaperIntervalMs: config.REAPER_INTERVAL_MS },
    "scheduler loops started",
  );

  return () => {
    clearInterval(weeklyTimer);
    clearInterval(reaperTimer);
  };
}

export async function startScheduler(): Promise<void> {
  const stopLoops = await startSchedulerLoops();
  logger.info({}, "scheduler process started");

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    stopLoops();
    await stopBoss();
    await pool.end();
    logger.info({}, "scheduler process shut down");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
