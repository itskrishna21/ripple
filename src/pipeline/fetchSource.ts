import type { Job } from "pg-boss";
import { config } from "../config";
import { logger } from "../lib/logger";
import { FetchSourceJob } from "../queue/jobs";
import { fetcherFor } from "../ingest/fetcher";
import { BlockedUrlError } from "../http/errors";
import { blobStore } from "../storage/blobStore";
import {
  markSourceOk,
  markSourceFailed,
} from "../service/snapshotSourceService";
import { settleSnapshotIfComplete } from "./settle";

/**
 * fetch.source handler.
 *
 * Terminal-failure contract (§5.6):
 * - On the final retry attempt (`retrycount >= FETCH_RETRY_LIMIT`) or for a
 *   `BlockedUrlError` (won't get safer on retry), mark the source `failed` and
 *   swallow the error so pg-boss does NOT retry.
 * - On any other error, rethrow so pg-boss backs off and retries.
 * - `settleSnapshotIfComplete` is always called in `finally` — on success AND
 *   on terminal failure — so the snapshot advances as soon as its last source
 *   resolves either way.
 */
export async function handleFetchSource(
  jobs: Job<FetchSourceJob>[],
): Promise<void> {
  for (const job of jobs) {
    const { snapshotId, competitorId, sourceKey, url } = job.data;
    const retryCount = ((job as unknown) as Record<string, unknown>).retrycount as number ?? 0;
    const isFinalAttempt = retryCount >= config.FETCH_RETRY_LIMIT;

    const log = logger.child({
      jobId: job.id,
      snapshotId,
      sourceKey,
      retryCount,
    });

    try {
      const fetcher = fetcherFor(sourceKey);
      const result = await fetcher.fetch(url);

      const storageKey = await blobStore.put(snapshotId, sourceKey, result.raw);
      await markSourceOk(snapshotId, sourceKey, {
        contentHash: result.contentHash,
        storageKey,
        normalized: result.normalized,
      });

      log.info({ storageKey, contentHash: result.contentHash }, "source fetched ok");
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const isTerminal = isFinalAttempt || err instanceof BlockedUrlError;

      if (isTerminal) {
        // Mark terminal failure — don't rethrow, let pg-boss complete the job.
        await markSourceFailed(snapshotId, sourceKey, reason).catch((e) =>
          log.error({ e }, "failed to mark source as failed"),
        );
        log.warn({ err, isFinalAttempt }, "source fetch failed (terminal)");
      } else {
        log.warn({ err, retryCount }, "source fetch failed (will retry)");
        throw err; // pg-boss retries
      }
    } finally {
      // Settle runs on both success and terminal-failure paths.
      await settleSnapshotIfComplete(snapshotId, competitorId).catch((err) =>
        log.error({ err }, "settle error"),
      );
    }
  }
}
