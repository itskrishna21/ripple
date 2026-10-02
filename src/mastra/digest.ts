import { config } from "../config";
import { logger } from "../lib/logger";
import { getMastra, mastraSchemas } from "./runtime";
import { DigestOutput, DigestOutputSchema } from "./schemas";

export async function draftDigest(input: {
  companyName: string;
  signals: Array<{ category: string; summary?: string; payload?: unknown }>;
}): Promise<DigestOutput> {
  if (!config.LLM_API_KEY) {
    logger.warn({}, "LLM_API_KEY not set — using digest stub");
    return digestStub(input);
  }

  const agent = getMastra().getAgent("digestAgent");
  const result = await agent.generate(
    `Company: ${input.companyName}\nSignals JSON:\n${JSON.stringify(input.signals)}`,
    { structuredOutput: { schema: mastraSchemas.digest } },
  );

  return DigestOutputSchema.parse(result.object) as DigestOutput;
}

export function digestStub(input: {
  companyName: string;
  signals: Array<{ category: string }>;
}): DigestOutput {
  const n = input.signals.length;
  return {
    subject: `${input.companyName}: ${n} signal${n === 1 ? "" : "s"} this period`,
    bullets:
      n === 0
        ? ["No competitive changes this period."]
        : input.signals.slice(0, 6).map((s) => `${s.category} detected.`),
  };
}
