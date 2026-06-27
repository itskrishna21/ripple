/**
 * Unit tests for the ingest utilities: hash, normalize, fetcher (mocked fetch).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { sha256 } from "../ingest/hash";
import { normalize } from "../ingest/normalize";

// ---------------------------------------------------------------------------
// hash
// ---------------------------------------------------------------------------
describe("sha256", () => {
  it("returns a 64-char hex string", () => {
    const h = sha256("hello world");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(sha256("same")).toBe(sha256("same"));
  });

  it("differs for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("known vector — empty string", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------
describe("normalize", () => {
  it("strips script tags and their content", () => {
    const result = normalize(
      "<html><script>var x=1;</script><p>Hello</p></html>",
      "https://example.com",
    );
    expect(result).not.toContain("var x=1");
    expect(result).toContain("Hello");
  });

  it("strips style tags", () => {
    const result = normalize(
      "<style>body{color:red}</style><main>Content</main>",
      "https://example.com",
    );
    expect(result).not.toContain("color:red");
    expect(result).toContain("Content");
  });

  it("strips nav, header, footer", () => {
    const result = normalize(
      "<nav>Nav</nav><main>Main</main><footer>Footer</footer>",
      "https://example.com",
    );
    expect(result).not.toContain("Nav");
    expect(result).not.toContain("Footer");
    expect(result).toContain("Main");
  });

  it("decodes HTML entities", () => {
    const result = normalize(
      "<p>AT&amp;T &lt;rocks&gt;</p>",
      "https://example.com",
    );
    expect(result).toContain("AT&T <rocks>");
  });

  it("collapses whitespace", () => {
    const result = normalize(
      "<p>  lots   of   spaces  </p>",
      "https://example.com",
    );
    expect(result).toBe("lots of spaces");
  });

  it("produces same output for cosmetically different markup", () => {
    const a = normalize('<p class="old">Pricing</p>', "https://example.com");
    const b = normalize('<p class="new">Pricing</p>', "https://example.com");
    expect(a).toBe(b);
  });
});
