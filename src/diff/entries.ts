/**
 * Entries diff — changelog and blog (v1 paragraph-split).
 *
 * Strategy: segment both versions into paragraphs (double newline or
 * heading boundaries). Emit paragraphs that appear in `current` but not
 * in `previous` as "added". Paragraphs removed from current are "removed".
 *
 * For changelog/blog the interesting signal is new entries, not rewrites.
 */
import { TrackedSourceKey } from "../schema/snapshot";
import { Candidate } from "./index";

function splitEntries(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30); // skip very short fragments
}

export function diffEntries(
  sourceKey: TrackedSourceKey,
  previous: string,
  current: string,
): Candidate[] {
  const prevSet = new Set(splitEntries(previous));
  const currEntries = splitEntries(current);
  const candidates: Candidate[] = [];

  for (const entry of currEntries) {
    if (!prevSet.has(entry)) {
      candidates.push({
        sourceKey,
        changeType: "added",
        after: entry.slice(0, 500),
        meta: { strategy: "paragraph-split-v1" },
      });
    }
  }

  return candidates;
}
