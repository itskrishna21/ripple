/**
 * Unit tests for the deterministic threat scorer.
 * Fully pure — no DB, no LLM, no network.
 */
import { describe, expect, it } from "vitest";
import { scoreSignals, POLICY_VERSION } from "../analysis/score";

describe("scoreSignals", () => {
  it("returns score=0 and empty breakdown for empty signals", () => {
    const result = scoreSignals([]);
    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual({});
  });

  it("POLICY_VERSION is defined", () => {
    expect(POLICY_VERSION).toBe("v1");
  });

  it("single max-severity pricing_change = score 33 (§8.3 baseline check)", () => {
    // raw = 1.0 × (5/5) = 1.0; score = round(1.0 / 3.0 × 100) = round(33.33) = 33
    const { score, breakdown } = scoreSignals([
      { category: "pricing_change", severity: 5 },
    ]);
    expect(score).toBe(33);
    expect(breakdown["pricing_change"]).toBe(1.0);
  });

  it("worked example from §8.3 produces score=55", () => {
    const signals = [
      { category: "pricing_change", severity: 5 }, // 1.0 × 1.0 = 1.00
      { category: "new_feature", severity: 3 },     // 0.8 × 0.6 = 0.48
      { category: "hiring", severity: 2 },           // 0.4 × 0.4 = 0.16
    ];
    const { score, breakdown } = scoreSignals(signals);
    // raw = 1.64; score = round(min(1, 1.64/3.0) × 100) = round(54.67) = 55
    expect(score).toBe(55);
    expect(breakdown["pricing_change"]).toBe(1.0);
    expect(breakdown["new_feature"]).toBeCloseTo(0.48, 2);
    expect(breakdown["hiring"]).toBeCloseTo(0.16, 2);
  });

  it("caps at score 100 — multiple max-severity pricing signals", () => {
    const signals = Array(10).fill({ category: "pricing_change", severity: 5 });
    const { score } = scoreSignals(signals);
    expect(score).toBe(100);
  });

  it("unknown category gets weight 0.2 (fallback)", () => {
    const { score, breakdown } = scoreSignals([
      { category: "unknown_category", severity: 5 },
    ]);
    // 0.2 × 1.0 = 0.2; score = round(0.2/3 × 100) = round(6.67) = 7
    expect(score).toBe(7);
    expect(breakdown["unknown_category"]).toBeCloseTo(0.2, 2);
  });

  it("accumulates breakdown per category across multiple signals", () => {
    const signals = [
      { category: "hiring", severity: 5 }, // 0.4 × 1.0 = 0.40
      { category: "hiring", severity: 5 }, // 0.4 × 1.0 = 0.40 → total 0.80
    ];
    const { breakdown } = scoreSignals(signals);
    expect(breakdown["hiring"]).toBeCloseTo(0.8, 2);
  });

  it("all category weights produce correct single-signal scores", () => {
    const cases = [
      ["pricing_change", 5, 33],    // 1.0/3.0 = 33.3 → 33
      ["new_feature", 5, 27],       // 0.8/3.0 = 26.7 → 27
      ["funding_or_news", 5, 23],   // 0.7/3.0 = 23.3 → 23
      ["deprecation", 5, 20],       // 0.6/3.0 = 20.0 → 20
      ["hiring", 5, 13],            // 0.4/3.0 = 13.3 → 13
      ["messaging_change", 5, 10],  // 0.3/3.0 = 10.0 → 10
      ["other", 5, 7],              // 0.2/3.0 = 6.67 → 7
    ] as const;

    for (const [category, severity, expected] of cases) {
      const { score } = scoreSignals([{ category, severity }]);
      expect(score, `${category} severity=${severity}`).toBe(expected);
    }
  });
});
