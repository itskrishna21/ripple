import type { Job, JobWithMetadata } from "pg-boss";
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

/** JSON.stringify drops Error.message — log a plain object instead. */
function errFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errName: err.name,
      errMessage: err.message,
      ...(typeof (err as NodeJS.ErrnoException).code === "string"
        ? { errCode: (err as NodeJS.ErrnoException).code }
        : {}),
    };
  }
  return { errMessage: String(err) };
}

/**
 * fetch.source handler.
 *
 * Terminal-failure contract (§5.6):
 * - On the final retry attempt (`retryCount >= FETCH_RETRY_LIMIT`) or for a
 *   `BlockedUrlError` (won't get safer on retry), mark the source `failed` and
 *   swallow the error so pg-boss does NOT retry.
 * - On any other error, rethrow so pg-boss backs off and retries.
 * - `settleSnapshotIfComplete` is always called in `finally` — on success AND
 *   on terminal failure — so the snapshot advances as soon as its last source
 *   resolves either way.
 *
 * Requires `includeMetadata: true` on the worker registration so retryCount
 * is present at runtime (pg-boss 12 WorkHandler types still expose plain Job).
 */
export async function handleFetchSource(
  jobs: Job<FetchSourceJob>[],
): Promise<void> {
  for (const job of jobs) {
    const meta = job as JobWithMetadata<FetchSourceJob>;
    const { snapshotId, competitorId, sourceKey, url } = meta.data;
    const retryCount = meta.retryCount ?? 0;
    const isFinalAttempt = retryCount >= config.FETCH_RETRY_LIMIT;

    const log = logger.child({
      jobId: meta.id,
      snapshotId,
      sourceKey,
      url,
      retryCount,
      retryLimit: meta.retryLimit,
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
          log.error(errFields(e), "failed to mark source as failed"),
        );
        log.warn({ ...errFields(err), isFinalAttempt }, "source fetch failed (terminal)");
      } else {
        log.warn({ ...errFields(err), retryCount }, "source fetch failed (will retry)");
        throw err; // pg-boss retries
      }
    } finally {
      // Settle runs on both success and terminal-failure paths.
      await settleSnapshotIfComplete(snapshotId, competitorId).catch((err) =>
        log.error(errFields(err), "settle error"),
      );
    }
  }
}
