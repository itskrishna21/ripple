/**
 * Pricing diff (v1 — whole-section diff).
 *
 * Strategy: treat the entire normalized pricing page as a single block.
 * If the hash already differs (guaranteed by the caller), emit one "modified"
 * candidate with the full before/after text so the LLM can identify specific
 * price changes. Per-plan parsing hardens in a later iteration.
 */
import { TrackedSourceKey } from "../schema/snapshot";
import { Candidate } from "./index";

export function diffPricing(
  sourceKey: TrackedSourceKey,
  previous: string,
  current: string,
): Candidate[] {
  if (previous === current) return [];

  return [
    {
      sourceKey,
      changeType: "modified",
      before: truncate(previous, 2000),
      after: truncate(current, 2000),
      meta: { strategy: "whole-section-v1" },
    },
  ];
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}
