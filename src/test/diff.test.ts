/**
 * Unit tests for the diff engine.
 * Fully deterministic — no DB, no LLM, no network.
 */
import { describe, expect, it } from "vitest";
import { diffSource } from "../diff/index";
import { diffPricing } from "../diff/pricing";
import { diffEntries } from "../diff/entries";
import { diffCareers } from "../diff/careers";

// ---------------------------------------------------------------------------
// diffSource dispatcher
// ---------------------------------------------------------------------------
describe("diffSource", () => {
  it("returns empty array when content is identical", () => {
    const text = "Plan A: $10/month  Plan B: $25/month";
    expect(diffSource("pricing", text, text)).toHaveLength(0);
  });

  it("dispatches pricing → diffPricing", () => {
    const result = diffSource("pricing", "old price $10", "new price $20");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.sourceKey).toBe("pricing");
    expect(result[0]!.changeType).toBe("modified");
  });

  it("dispatches changelog → diffEntries", () => {
    const prev = "Feature A shipped.\n\nOld entry here.";
    const curr = "Feature A shipped.\n\nNew changelog entry that is longer.\n\nOld entry here.";
    const result = diffSource("changelog", prev, curr);
    expect(result.some((c) => c.changeType === "added")).toBe(true);
  });

  it("dispatches blog → diffEntries", () => {
    const prev = "Old blog post content here, enough chars.";
    const curr = "Old blog post content here, enough chars.\n\nCompletely new blog post entry added this week with enough text.";
    const result = diffSource("blog", prev, curr);
    expect(result.some((c) => c.changeType === "added")).toBe(true);
  });

  it("dispatches careers → diffCareers", () => {
    const prev = "Software Engineer - NYC\nProduct Manager - NYC";
    const curr = "Software Engineer - NYC\nProduct Manager - NYC\nSenior Designer - Remote (new role)";
    const result = diffSource("careers", prev, curr);
    expect(result.some((c) => c.changeType === "added")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// diffPricing
// ---------------------------------------------------------------------------
describe("diffPricing", () => {
  it("returns empty when content is identical", () => {
    expect(diffPricing("pricing", "same", "same")).toHaveLength(0);
  });

  it("returns one modified candidate when content differs", () => {
    const result = diffPricing("pricing", "Price: $10", "Price: $20");
    expect(result).toHaveLength(1);
    expect(result[0]!.changeType).toBe("modified");
    expect(result[0]!.before).toContain("$10");
    expect(result[0]!.after).toContain("$20");
  });

  it("truncates very long content in before/after", () => {
    const long = "x".repeat(5000);
    const result = diffPricing("pricing", long, "y".repeat(5000));
    expect((result[0]!.before ?? "").length).toBeLessThanOrEqual(2010);
  });
});

// ---------------------------------------------------------------------------
// diffEntries
// ---------------------------------------------------------------------------
describe("diffEntries", () => {
  it("returns empty when no new paragraphs", () => {
    const text = "Same paragraph one.\n\nSame paragraph two. More text here to exceed 30 chars.";
    expect(diffEntries("changelog", text, text)).toHaveLength(0);
  });

  it("finds new paragraphs added in current", () => {
    const prev = "Old feature release with enough text.\n\nAnother entry here with good length.";
    const curr = prev + "\n\nBrand new changelog entry published this week, definitely new content.";
    const result = diffEntries("changelog", prev, curr);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.changeType).toBe("added");
    expect(result[0]!.after).toContain("Brand new");
  });

  it("ignores short fragments under 30 chars", () => {
    const prev = "Short.";
    const curr = "Short.\n\nAlso short.";
    expect(diffEntries("changelog", prev, curr)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// diffCareers
// ---------------------------------------------------------------------------
describe("diffCareers", () => {
  it("returns empty when line sets are identical", () => {
    const text = "Engineer - NYC\nDesigner - SF";
    expect(diffCareers("careers", text, text)).toHaveLength(0);
  });

  it("detects new job openings as added", () => {
    const prev = "Engineer - NYC\nDesigner - SF";
    const curr = "Engineer - NYC\nDesigner - SF\nProduct Manager - Remote (new)";
    const result = diffCareers("careers", prev, curr);
    const added = result.find((c) => c.changeType === "added");
    expect(added).toBeDefined();
    expect((added!.meta as { count: number }).count).toBe(1);
  });

  it("detects removed job listings as removed", () => {
    const prev = "Engineer - NYC\nDesigner - SF\nOld role - Boston, Massachusetts";
    const curr = "Engineer - NYC\nDesigner - SF";
    const result = diffCareers("careers", prev, curr);
    const removed = result.find((c) => c.changeType === "removed");
    expect(removed).toBeDefined();
    expect((removed!.meta as { count: number }).count).toBe(1);
  });

  it("can report both added and removed in the same result", () => {
    const prev = "Engineer - NYC\nOld role gone from company site";
    const curr = "Engineer - NYC\nNew senior role appeared on careers page";
    const result = diffCareers("careers", prev, curr);
    const changeTypes = result.map((c) => c.changeType);
    expect(changeTypes).toContain("added");
    expect(changeTypes).toContain("removed");
  });
});
