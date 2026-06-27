import { config } from "../config";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { getBoss, stopBoss } from "../queue/boss";
import {
  AnalyzeSnapshotJob,
  FetchSourceJob,
  QUEUES,
  SnapshotStartJob,
} from "../queue/jobs";
import { handleSnapshotStart } from "../pipeline/snapshotStart";
import { handleFetchSource } from "../pipeline/fetchSource";
import type { Job } from "pg-boss";

// analyze.snapshot handler — implemented in Phase 4 (Intelligence PR).
async function handleAnalyzeSnapshot(
  jobs: Job<AnalyzeSnapshotJob>[],
): Promise<void> {
  for (const job of jobs) {
    logger.info(
      { jobId: job.id, snapshotId: job.data.snapshotId },
      "analyze.snapshot received (Phase 4 stub)",
    );
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function startWorker(): Promise<void> {
  const boss = await getBoss();

  await boss.work<SnapshotStartJob>(
    QUEUES.snapshotStart,
    handleSnapshotStart,
  );

  await boss.work<FetchSourceJob>(
    QUEUES.fetchSource,
    { localConcurrency: config.WORKER_FETCH_CONCURRENCY },
    handleFetchSource,
  );

  await boss.work<AnalyzeSnapshotJob>(
    QUEUES.analyzeSnapshot,
    { localConcurrency: config.WORKER_ANALYZE_CONCURRENCY },
    handleAnalyzeSnapshot,
  );

  logger.info(
    {
      fetchConcurrency: config.WORKER_FETCH_CONCURRENCY,
      analyzeConcurrency: config.WORKER_ANALYZE_CONCURRENCY,
    },
    "worker process started",
  );

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    // stopBoss({ graceful: true }) drains in-flight jobs before closing.
    await stopBoss();
    await pool.end();
    logger.info({}, "worker process shut down");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
