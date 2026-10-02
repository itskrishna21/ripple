import { describe, expect, it } from "vitest";
import { discoverStub } from "../mastra/discover";
import { deterministicStub } from "../mastra/categorize";
import { digestStub } from "../mastra/digest";
import {
  evalCategorizeNoEmptySummary,
  evalCategorizeSchema,
  evalDiscoverHttps,
  evalDiscoverPrecision,
  evalDiscoverSchema,
  evalDigestGrounded,
  runEvals,
} from "../mastra/evals";

describe("mastra evals — categorize", () => {
  it("stub output passes schema + summary evals", () => {
    const out = deterministicStub([
      { sourceKey: "pricing", changeType: "modified", before: "$10", after: "$12" },
    ]);
    const results = [evalCategorizeSchema(out), evalCategorizeNoEmptySummary(out)];
    expect(runEvals(results).failed).toBe(0);
    expect(out.signals[0]?.category).toBe("other");
  });

  it("rejects empty summary", () => {
    const bad = { signals: [], summary: "   " };
    expect(evalCategorizeNoEmptySummary(bad).pass).toBe(false);
  });
});

describe("mastra evals — discover", () => {
  it("stripe stub is https and hits known peers", () => {
    const out = discoverStub("Stripe");
    const results = [
      evalDiscoverSchema(out),
      evalDiscoverHttps(out),
      evalDiscoverPrecision(out, ["Adyen", "Checkout.com"]),
    ];
    expect(runEvals(results).failed).toBe(0);
  });

  it("rejects http websites", () => {
    expect(
      evalDiscoverHttps({
        company: "X",
        competitors: [{ name: "Y", website: "http://y.com", why: "no" }],
      }).pass,
    ).toBe(false);
  });
});

describe("mastra evals — digest", () => {
  it("stub bullets stay in known categories", () => {
    const out = digestStub({
      companyName: "Acme",
      signals: [{ category: "pricing_change" }],
    });
    expect(evalDigestGrounded(out, ["pricing_change"]).pass).toBe(true);
  });
});
