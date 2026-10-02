import { config } from "../config";
import { logger } from "../lib/logger";
import { fetchDiscoverContext } from "./discoverSearch";
import { getMastra, mastraSchemas } from "./runtime";
import {
  DiscoverOutput,
  DiscoverOutputSchema,
  DiscoverCandidate,
} from "./schemas";

export async function discoverCompetitors(
  companyName: string,
): Promise<DiscoverOutput> {
  if (!config.LLM_API_KEY) {
    logger.warn({ companyName }, "LLM_API_KEY not set — using discover stub");
    return discoverStub(companyName);
  }

  const webContext = await fetchDiscoverContext(companyName);
  const userPrompt = webContext
    ? `Company: ${companyName}\n\n${webContext}\n\nPropose substitutes in the same product category (not parent AI labs).`
    : `Company: ${companyName}\nPropose substitutes in the same product category (not parent AI labs).`;

  const agent = getMastra().getAgent("discoverAgent");
  const result = await agent.generate(userPrompt, {
    structuredOutput: { schema: mastraSchemas.discover },
  });

  return DiscoverOutputSchema.parse(result.object) as DiscoverOutput;
}

/** Deterministic shortlist so CI / local UI works without an API key. */
export function discoverStub(companyName: string): DiscoverOutput {
  const key = companyName.trim().toLowerCase();
  const presets: Record<string, DiscoverCandidate[]> = {
    stripe: [
      {
        name: "Adyen",
        website: "https://www.adyen.com",
        pricingUrl: "https://www.adyen.com/pricing",
        careersUrl: "https://www.adyen.com/careers",
        why: "Global payments processor competing on enterprise checkout.",
      },
      {
        name: "Checkout.com",
        website: "https://www.checkout.com",
        pricingUrl: "https://www.checkout.com/pricing",
        why: "Direct payments-platform competitor.",
      },
      {
        name: "Square",
        website: "https://squareup.com",
        pricingUrl: "https://squareup.com/us/en/pricing",
        why: "Overlaps on SMB payments and online checkout.",
      },
    ],
  };

  const competitors =
    presets[key] ??
    [
      {
        name: `${companyName} Labs`,
        website: "https://example.com",
        why: "Stub peer in the same category (set LLM_API_KEY for a real list).",
      },
      {
        name: `${companyName} Cloud`,
        website: "https://example.org",
        why: "Stub peer in the same category (set LLM_API_KEY for a real list).",
      },
    ];

  return { company: companyName, competitors };
}
