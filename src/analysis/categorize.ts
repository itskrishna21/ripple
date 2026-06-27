import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { config } from "../config";
import { logger } from "../lib/logger";
import { Candidate } from "../diff/index";
import { AnalysisOutput, AnalysisOutputSchema } from "./agent";

/** Bump when the prompt OR model changes — starts a new categorization lineage. */
export const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `
You are a competitive intelligence analyst. For each candidate change, output
structured signals. Each signal must have:
- sourceKey: which part of the site changed
- category: type of competitive signal (pricing_change, new_feature, deprecation,
  hiring, funding_or_news, messaging_change, or other)
- changeType: added / removed / modified
- severity: 1 (minor wording) to 5 (major strategic shift)
- payload: structured data you extract (prices, feature names, etc.)

Write a 1-2 sentence summary of the most significant change overall.
Only report what is actually present in the candidate text — no hallucination.
`.trim();

/**
 * Categorize candidate changes via the OpenAI LLM with structured output.
 *
 * If no LLM_API_KEY is configured, falls back to a deterministic stub that
 * emits one "other/severity=1" signal per candidate — safe for development
 * and lets the pipeline exercise the rest of the flow.
 */
export async function categorize(
  candidates: Candidate[],
): Promise<AnalysisOutput> {
  if (!config.LLM_API_KEY) {
    logger.warn(
      { candidateCount: candidates.length },
      "LLM_API_KEY not set — using deterministic stub for categorize",
    );
    return deterministicStub(candidates);
  }

  const openai = createOpenAI({ apiKey: config.LLM_API_KEY });
  const prompt = buildPrompt(candidates);

  const result = await generateObject({
    model: openai(config.LLM_MODEL),
    system: SYSTEM_PROMPT,
    prompt,
    schema: AnalysisOutputSchema as import("zod").ZodType,
  });

  // Re-parse to ensure types align between Zod versions
  return AnalysisOutputSchema.parse(result.object) as AnalysisOutput;
}

function buildPrompt(candidates: Candidate[]): string {
  const items = candidates
    .map((c, i) => {
      const lines: string[] = [
        `Candidate ${i + 1}: source=${c.sourceKey} change=${c.changeType}`,
      ];
      if (c.before) lines.push(`BEFORE:\n${c.before}`);
      if (c.after) lines.push(`AFTER:\n${c.after}`);
      if (c.meta) lines.push(`META: ${JSON.stringify(c.meta)}`);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return `Analyze the following competitor changes and return structured signals:\n\n${items}`;
}

/** Zero-dependency stub for local dev / CI without an LLM key. */
function deterministicStub(candidates: Candidate[]): AnalysisOutput {
  const signals = candidates.map((c) => ({
    sourceKey: c.sourceKey,
    category: "other" as const,
    changeType: c.changeType,
    severity: 1 as const,
    payload: {} as Record<string, unknown>,
  }));

  const count = candidates.length;
  const summary =
    count === 0
      ? "No changes detected."
      : `${count} change${count > 1 ? "s" : ""} detected (stub — set LLM_API_KEY for real analysis).`;

  return { signals, summary };
}
