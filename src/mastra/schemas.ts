import { z } from "zod";
import { AnalysisOutputSchema, SignalSchema } from "../analysis/agent";

export { AnalysisOutputSchema, SignalSchema };

export const DiscoverCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().min(1),
  pricingUrl: z.string().optional(),
  changelogUrl: z.string().optional(),
  careersUrl: z.string().optional(),
  blogUrl: z.string().optional(),
  why: z.string().min(1),
});

export const DiscoverOutputSchema = z.object({
  company: z.string().min(1),
  competitors: z.array(DiscoverCandidateSchema).min(1).max(15),
});

export type DiscoverCandidate = z.infer<typeof DiscoverCandidateSchema>;
export type DiscoverOutput = z.infer<typeof DiscoverOutputSchema>;
