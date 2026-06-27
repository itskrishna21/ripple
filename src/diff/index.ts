import { TrackedSourceKey } from "../schema/snapshot";
import { diffPricing } from "./pricing";
import { diffEntries } from "./entries";
import { diffCareers } from "./careers";

export type ChangeType = "added" | "removed" | "modified";

export type Candidate = {
  sourceKey: TrackedSourceKey;
  changeType: ChangeType;
  before?: string;
  after?: string;
  meta?: Record<string, unknown>;
};

/**
 * Produce a list of candidate changes between two normalized text snapshots
 * of the same source. Fully deterministic — no LLM.
 *
 * Callers are responsible for:
 * - Skipping sources where `previous` is undefined (new source this week — §8.4)
 * - Skipping sources where contentHash is unchanged (fast-path, no diff needed)
 */
export function diffSource(
  sourceKey: TrackedSourceKey,
  previous: string,
  current: string,
): Candidate[] {
  switch (sourceKey) {
    case "pricing":
      return diffPricing(sourceKey, previous, current);
    case "changelog":
    case "blog":
      return diffEntries(sourceKey, previous, current);
    case "careers":
      return diffCareers(sourceKey, previous, current);
  }
}
