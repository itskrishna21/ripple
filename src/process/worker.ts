import type { Job } from "pg-boss";
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

// ---------------------------------------------------------------------------
// Job handlers (stubs — filled in during Phase 3)
// ---------------------------------------------------------------------------

async function handleSnapshotStart(jobs: Job<SnapshotStartJob>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, queue: QUEUES.snapshotStart });
    log.info({ data: job.data }, "snapshot.start received");
    // TODO: Phase 3 — implement src/pipeline/snapshotStart.ts
  }
}

async function handleFetchSource(jobs: Job<FetchSourceJob>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, queue: QUEUES.fetchSource });
    log.info({ data: job.data }, "fetch.source received");
    // TODO: Phase 3 — implement src/pipeline/fetchSource.ts
  }
}

async function handleAnalyzeSnapshot(jobs: Job<AnalyzeSnapshotJob>[]): Promise<void> {
  for (const job of jobs) {
    const log = logger.child({ jobId: job.id, queue: QUEUES.analyzeSnapshot });
    log.info({ data: job.data }, "analyze.snapshot received");
    // TODO: Phase 3 — implement src/pipeline/analyzeSnapshot.ts
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
