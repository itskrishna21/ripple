import { describe, it, expect } from "vitest";
import {
  parseDdgHtml,
  formatDiscoverContext,
  searchQueries,
} from "../mastra/discoverSearch";

const SAMPLE = `
<h2 class="result__title">
  <a class="result__a" href="#">TypeScript AI Framework | Mastra</a>
</h2>
<a class="result__snippet" href="#"><b>Mastra</b> is an open-source TypeScript <b>framework</b> for AI agents.</a>
<h2 class="result__title">
  <a class="result__a" href="#">About Mastra</a>
</h2>
<a class="result__snippet" href="#">We help JavaScript developers build AI agents.</a>
`;

describe("parseDdgHtml", () => {
  it("extracts titles and snippets from DuckDuckGo HTML", () => {
    const hits = parseDdgHtml(SAMPLE);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.title).toContain("Mastra");
    expect(hits[0]!.snippet).toMatch(/TypeScript/i);
  });
});

describe("formatDiscoverContext", () => {
  it("returns empty for no hits", () => {
    expect(formatDiscoverContext([])).toBe("");
  });

  it("numbers hits for the agent prompt", () => {
    const text = formatDiscoverContext([
      { title: "Mastra AI", snippet: "Agent framework" },
    ]);
    expect(text).toMatch(/named competitors/i);
    expect(text).toContain("1. Mastra AI — Agent framework");
  });
});

describe("searchQueries", () => {
  it("asks for product and competitors", () => {
    expect(searchQueries("Mastra")).toEqual([
      "Mastra company product",
      "Mastra competitors",
    ]);
  });
});
