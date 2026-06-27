import { getBoss } from "./boss";
import {
  AnalyzeSnapshotJob,
  FetchSourceJob,
  QUEUES,
  SnapshotStartJob,
} from "./jobs";

/**
 * Enqueue a snapshot.start job.
 * singletonKey = competitorId:weekStart ensures exactly one job exists for a
 * given competitor-week at any point in time.
 */
export async function enqueueSnapshotStart(job: SnapshotStartJob): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUES.snapshotStart, job, {
    singletonKey: `${job.competitorId}:${job.weekStart}`,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    deadLetter: QUEUES.snapshotStartDlq,
  });
}

/**
 * Enqueue a fetch.source job.
 * singletonKey = snapshotId:sourceKey — idempotent fan-out.
 */
export async function enqueueFetchSource(job: FetchSourceJob): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUES.fetchSource, job, {
    singletonKey: `${job.snapshotId}:${job.sourceKey}`,
    retryLimit: 5,
    retryDelay: 15,
    retryBackoff: true,
    deadLetter: QUEUES.fetchSourceDlq,
  });
}

/**
 * Enqueue an analyze.snapshot job.
 * singletonKey = snapshotId — only one analysis in flight per snapshot.
 * Safe to call concurrently from multiple settle calls; pg-boss dedupes.
 */
export async function enqueueAnalyze(job: AnalyzeSnapshotJob): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUES.analyzeSnapshot, job, {
    singletonKey: job.snapshotId,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: QUEUES.analyzeSnapshotDlq,
  });
}
