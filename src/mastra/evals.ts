/**
 * Lightweight evals over agent outputs — no live LLM required.
 * These are the scoring functions Mastra scorers would wrap in CI.
 */
import { AnalysisOutputSchema } from "../analysis/agent";
import { DiscoverOutputSchema, DigestOutputSchema } from "./schemas";

export type EvalResult = {
  name: string;
  pass: boolean;
  detail: string;
};

export function evalCategorizeSchema(output: unknown): EvalResult {
  const parsed = AnalysisOutputSchema.safeParse(output);
  return {
    name: "categorize.schema",
    pass: parsed.success,
    detail: parsed.success ? "ok" : parsed.error.message,
  };
}

/** Every signal category must be from the closed enum (schema already enforces). */
export function evalCategorizeNoEmptySummary(output: unknown): EvalResult {
  const parsed = AnalysisOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { name: "categorize.summary", pass: false, detail: "invalid output" };
  }
  const ok = parsed.data.summary.trim().length > 0;
  return {
    name: "categorize.summary",
    pass: ok,
    detail: ok ? "ok" : "empty summary",
  };
}

export function evalDiscoverSchema(output: unknown): EvalResult {
  const parsed = DiscoverOutputSchema.safeParse(output);
  return {
    name: "discover.schema",
    pass: parsed.success,
    detail: parsed.success ? "ok" : parsed.error.message,
  };
}

export function evalDiscoverHttps(output: unknown): EvalResult {
  const parsed = DiscoverOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { name: "discover.https", pass: false, detail: "invalid output" };
  }
  const bad = parsed.data.competitors.filter(
    (c) => !c.website.startsWith("https://"),
  );
  return {
    name: "discover.https",
    pass: bad.length === 0,
    detail: bad.length === 0 ? "ok" : `non-https: ${bad.map((c) => c.name).join(",")}`,
  };
}

export function evalDiscoverPrecision(
  output: unknown,
  expectedNames: string[],
): EvalResult {
  const parsed = DiscoverOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { name: "discover.precision", pass: false, detail: "invalid output" };
  }
  const got = new Set(parsed.data.competitors.map((c) => c.name.toLowerCase()));
  const hits = expectedNames.filter((n) => got.has(n.toLowerCase()));
  const pass = hits.length >= Math.min(2, expectedNames.length);
  return {
    name: "discover.precision",
    pass,
    detail: `matched ${hits.length}/${expectedNames.length}`,
  };
}

export function evalDigestGrounded(
  output: unknown,
  allowedCategories: string[],
): EvalResult {
  const parsed = DigestOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { name: "digest.grounded", pass: false, detail: "invalid output" };
  }
  const allowed = allowedCategories.map((c) => c.toLowerCase());
  const extra = parsed.data.bullets.filter(
    (b) =>
      allowed.length > 0 &&
      !allowed.some((c) => b.toLowerCase().includes(c)) &&
      !b.toLowerCase().includes("no competitive"),
  );
  return {
    name: "digest.grounded",
    pass: extra.length === 0,
    detail: extra.length === 0 ? "ok" : `ungrounded: ${extra.join(" | ")}`,
  };
}

export function runEvals(results: EvalResult[]): { passed: number; failed: number } {
  const failed = results.filter((r) => !r.pass).length;
  return { passed: results.length - failed, failed };
}
