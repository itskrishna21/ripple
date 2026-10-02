import { config } from "../config";
import { logger } from "../lib/logger";

export type SearchHit = { title: string; snippet: string };

const SEARCH_TIMEOUT_MS = 12_000;

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse DuckDuckGo HTML results (used when SERPER_API_KEY is unset). */
export function parseDdgHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = html.split(/class="result__title"/).slice(1);

  for (const block of blocks.slice(0, 6)) {
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    hits.push({
      title: stripTags(titleMatch[1]!),
      snippet: snippetMatch ? stripTags(snippetMatch[1]!) : "",
    });
  }

  return hits;
}

export function searchQueries(companyName: string): string[] {
  const name = companyName.trim();
  return [`${name} company product`, `${name} competitors`];
}

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const key = h.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.slice(0, 10);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ddgHtmlSearch(query: string): Promise<SearchHit[]> {
  const q = encodeURIComponent(query);
  const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${q}`, {
    headers: {
      "User-Agent": "Ripple/1.0 (competitive intelligence; +https://github.com)",
    },
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo search HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseDdgHtml(html).slice(0, 5);
}

async function serperSearch(query: string): Promise<SearchHit[]> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": config.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; snippet?: string }>;
  };
  return (data.organic ?? [])
    .filter((o) => o.title)
    .map((o) => ({
      title: o.title!.trim(),
      snippet: (o.snippet ?? "").trim(),
    }));
}

export function formatDiscoverContext(hits: SearchHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h, i) => {
    const bit = h.snippet ? `${h.title} — ${h.snippet}` : h.title;
    return `${i + 1}. ${bit}`;
  });
  return [
    "Web search snippets (what they sell + named competitors). Ignore homonyms.",
    ...lines,
  ].join("\n");
}

async function searchAll(companyName: string): Promise<SearchHit[]> {
  const run = config.SERPER_API_KEY ? serperSearch : ddgHtmlSearch;
  const batches = await Promise.all(searchQueries(companyName).map((q) => run(q)));
  return dedupeHits(batches.flat());
}

/** Snippets for the discover agent; empty string if search fails or returns nothing. */
export async function fetchDiscoverContext(companyName: string): Promise<string> {
  try {
    return formatDiscoverContext(await searchAll(companyName));
  } catch (err) {
    logger.warn({ err, companyName }, "discover web search failed");
    return "";
  }
}
