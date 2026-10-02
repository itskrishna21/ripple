import { logger } from "../lib/logger";
import { getWeekStart } from "../lib/week";
import { enqueueSnapshotStart } from "./publish";

/** First photo for a newly tracked rival. Weekly scheduler keeps the tape going. */
export async function enqueueBaselineSnapshot(competitorId: string): Promise<void> {
  try {
    await enqueueSnapshotStart({
      competitorId,
      weekStart: getWeekStart(),
    });
  } catch (err) {
    logger.warn({ err, competitorId }, "failed to enqueue baseline snapshot");
  }
}
