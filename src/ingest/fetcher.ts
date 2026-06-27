import { config } from "../config";
import { TrackedSourceKey } from "../schema/snapshot";
import { assertUrlSafe } from "./ssrf";
import { normalize } from "./normalize";
import { sha256 } from "./hash";

export type FetchResult = {
  raw: string;
  normalized: string;
  contentHash: string;
};

export interface SourceFetcher {
  key: TrackedSourceKey;
  fetch(url: string): Promise<FetchResult>;
}

export class HttpFetcher implements SourceFetcher {
  constructor(public key: TrackedSourceKey) {}

  async fetch(url: string): Promise<FetchResult> {
    // SSRF check before any network I/O. Throws BlockedUrlError for private targets.
    await assertUrlSafe(url);

    const raw = await fetchWithLimits(url);
    const normalized = normalize(raw, url);
    const contentHash = sha256(normalized);
    return { raw, normalized, contentHash };
  }
}

async function fetchWithLimits(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.FETCH_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RippleBot/1.0",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/") && !contentType.includes("application/xhtml")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > config.FETCH_MAX_BYTES) {
        reader.cancel().catch(() => undefined);
        throw new Error(`Response too large (>${config.FETCH_MAX_BYTES} bytes)`);
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks).toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

// Singleton fetchers per source key — stateless but avoids repeated allocation.
const _fetchers = new Map<TrackedSourceKey, HttpFetcher>();

export function fetcherFor(key: TrackedSourceKey): SourceFetcher {
  if (!_fetchers.has(key)) {
    _fetchers.set(key, new HttpFetcher(key));
  }
  return _fetchers.get(key)!;
}
