import type { Job } from "pg-boss";
import { logger } from "../lib/logger";
import { SnapshotStartJob } from "../queue/jobs";
import { enqueueFetchSource } from "../queue/publish";
import {
  getCompetitorSourceUrls,
  upsertSnapshot,
  insertSource,
  setSnapshotStatus,
} from "../service/snapshotSourceService";

/**
 * snapshot.start handler.
 *
 * For each incoming job:
 *   1. Look up the competitor's source URLs.
 *   2. Upsert a snapshot row (idempotent on retry).
 *   3. Insert one pending snapshot_sources row per URL (ON CONFLICT DO NOTHING).
 *   4. Enqueue one fetch.source job per URL.
 *
 * If the competitor has no source URLs configured we log and skip — no point
 * creating an empty snapshot that will never settle.
 */
export async function handleSnapshotStart(
  jobs: Job<SnapshotStartJob>[],
): Promise<void> {
  for (const job of jobs) {
    const { competitorId, weekStart } = job.data;
    const log = logger.child({ jobId: job.id, competitorId, weekStart });

    try {
      const sources = await getCompetitorSourceUrls(competitorId);

      if (sources.length === 0) {
        log.warn({}, "competitor has no source URLs — skipping snapshot");
        continue;
      }

      const snapshot = await upsertSnapshot(competitorId, weekStart);
      log.info({ snapshotId: snapshot.id }, "snapshot upserted");

      for (const { key, url } of sources) {
        await insertSource(snapshot.id, key);
        await enqueueFetchSource({
          snapshotId: snapshot.id,
          competitorId,
          sourceKey: key,
          url,
        });
      }

      log.info(
        { snapshotId: snapshot.id, sourceCount: sources.length },
        "fetch.source jobs enqueued",
      );
    } catch (err) {
      log.error({ err }, "snapshot.start handler failed — will retry");
      throw err; // pg-boss retries
    }
  }
}
