import { config } from "../config";
import { logger } from "../lib/logger";
import { Candidate } from "../diff/index";
import { AnalysisOutput, AnalysisOutputSchema } from "../analysis/agent";
import { getMastra, MASTRA_PROMPT_VERSION, mastraSchemas } from "./runtime";

export const PROMPT_VERSION = MASTRA_PROMPT_VERSION;

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

  const agent = getMastra().getAgent("categorizeAgent");
  const result = await agent.generate(buildPrompt(candidates), {
    structuredOutput: { schema: mastraSchemas.categorize },
  });

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

export function deterministicStub(candidates: Candidate[]): AnalysisOutput {
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
