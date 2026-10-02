/**
 * Mastra runtime — agents are the only LLM surface.
 * pg-boss / fetch / diff stay outside this module.
 */
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core";
import { config } from "../config";
import {
  AnalysisOutputSchema,
  DiscoverOutputSchema,
  DigestOutputSchema,
} from "./schemas";

const CATEGORIZE_INSTRUCTIONS = `
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

const DISCOVER_INSTRUCTIONS = `
You propose real competitors for a company. Return 5–10 names with public
https websites and optional pricing/changelog/careers/blog URLs.
Use web search context to infer the product type (do not confuse homonyms).
Pick substitutes a buyer would evaluate instead of this company — same
category (e.g. agent/app frameworks vs other frameworks, not model APIs).
Exclude foundation-model labs, generic AI platforms, and research orgs
unless they ship the same product type.
Do not invent companies. Prefer names that appear in the competitor snippets.
Each why is one short sentence naming the overlap.
`.trim();

const DIGEST_INSTRUCTIONS = `
You write a short weekly competitive digest from stored signals only.
Subject line under 80 chars. 3–6 bullets. No claims not in the signals.
`.trim();

function modelId(): `${string}/${string}` {
  return `openai/${config.LLM_MODEL}`;
}

function ensureOpenAiKey(): void {
  if (config.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = config.LLM_API_KEY;
  }
}

let cached: Mastra | null = null;

export function getMastra(): Mastra {
  if (cached) return cached;
  ensureOpenAiKey();

  const categorizeAgent = new Agent({
    id: "categorize",
    name: "categorize",
    instructions: CATEGORIZE_INSTRUCTIONS,
    model: modelId(),
  });

  const discoverAgent = new Agent({
    id: "discover",
    name: "discover",
    instructions: DISCOVER_INSTRUCTIONS,
    model: modelId(),
  });

  const digestAgent = new Agent({
    id: "digest",
    name: "digest",
    instructions: DIGEST_INSTRUCTIONS,
    model: modelId(),
  });

  cached = new Mastra({
    agents: { categorizeAgent, discoverAgent, digestAgent },
  });
  return cached;
}

export const mastraSchemas = {
  categorize: AnalysisOutputSchema,
  discover: DiscoverOutputSchema,
  digest: DigestOutputSchema,
};

export const MASTRA_PROMPT_VERSION = "v1";
