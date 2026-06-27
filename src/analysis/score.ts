/**
 * Deterministic threat scorer (§8.2).
 *
 * Pure function over stored signals — given the same Signal[] rows it always
 * returns the same number. This is what makes re-scoring history reproducible
 * even when the LLM categorization changes.
 *
 * Formula: raw = Σ weight(category) × (severity / 5)
 *          score = round(min(1, raw / SCALE) × 100)   → 0..100
 */

/** Scoring policy version. Bump when ANY constant below changes. */
export const POLICY_VERSION = "v1";

const CATEGORY_WEIGHT: Record<string, number> = {
  pricing_change: 1.0,
  new_feature: 0.8,
  funding_or_news: 0.7,
  deprecation: 0.6,
  hiring: 0.4,
  messaging_change: 0.3,
  other: 0.2,
};

/**
 * `SCALE` is the raw-score value that maps to 100.
 * Rationale: a "maximum alarm" week requires ≈ one max pricing change plus
 * two more high-severity signals (1.0 + ~1.0 + ~1.0 ≈ 3.0).
 * See §8.3 for the worked example.
 */
const SCALE = 3.0;

export type Signal = {
  category: string;
  severity: number; // 1..5
};

export type ScoreResult = {
  score: number; // 0..100
  breakdown: Record<string, number>; // category → cumulative contribution
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreSignals(signals: Signal[]): ScoreResult {
  const breakdown: Record<string, number> = {};
  let raw = 0;

  for (const s of signals) {
    const weight = CATEGORY_WEIGHT[s.category] ?? 0.2;
    const contribution = weight * (s.severity / 5);
    breakdown[s.category] = round2((breakdown[s.category] ?? 0) + contribution);
    raw += contribution;
  }

  const score = Math.round(Math.min(1, raw / SCALE) * 100);
  return { score, breakdown };
}
