/**
 * Careers diff (v1 — line set diff).
 *
 * Strategy: each non-empty line on the careers page is treated as a job
 * listing entry. Lines in `current` not in `previous` are new openings
 * ("added"); lines in `previous` not in `current` are closed roles ("removed").
 *
 * A later iteration can parse structured job data (title + location) for
 * richer meta. For v1 we just count opens vs closes.
 */
import { TrackedSourceKey } from "../schema/snapshot";
import { Candidate } from "./index";

function toLineSet(text: string): Set<string> {
  return new Set(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 10),
  );
}

export function diffCareers(
  sourceKey: TrackedSourceKey,
  previous: string,
  current: string,
): Candidate[] {
  const prevLines = toLineSet(previous);
  const currLines = toLineSet(current);
  const candidates: Candidate[] = [];

  const added = [...currLines].filter((l) => !prevLines.has(l));
  const removed = [...prevLines].filter((l) => !currLines.has(l));

  if (added.length > 0) {
    candidates.push({
      sourceKey,
      changeType: "added",
      after: added.slice(0, 10).join("\n"),
      meta: { count: added.length, strategy: "line-set-v1" },
    });
  }

  if (removed.length > 0) {
    candidates.push({
      sourceKey,
      changeType: "removed",
      before: removed.slice(0, 10).join("\n"),
      meta: { count: removed.length, strategy: "line-set-v1" },
    });
  }

  return candidates;
}
