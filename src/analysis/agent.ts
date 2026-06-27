/**
 * LLM layer: schema definitions and the categorize call.
 *
 * Uses Vercel AI SDK's `generateObject` for structured output — schema-enforced
 * JSON that the Zod schema validates before returning. This is Mastra-compatible
 * (same underlying AI SDK) but avoids the Mastra Agent abstraction, which has
 * version-pinning constraints.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas — source of truth for the LLM response and the signals table
// ---------------------------------------------------------------------------

export const SignalSchema = z.object({
  sourceKey: z.enum(["pricing", "changelog", "careers", "blog"]),
  category: z.enum([
    "pricing_change",
    "new_feature",
    "deprecation",
    "hiring",
    "funding_or_news",
    "messaging_change",
    "other",
  ]),
  changeType: z.enum(["added", "removed", "modified"]),
  severity: z.number().int().min(1).max(5),
  payload: z.record(z.string(), z.unknown()),
});

export type SignalInput = z.infer<typeof SignalSchema>;

export const AnalysisOutputSchema = z.object({
  signals: z.array(SignalSchema),
  summary: z.string().min(1),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
