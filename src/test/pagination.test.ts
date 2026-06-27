import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  paginate,
  parseLimit,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../http/pagination";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a valid payload", () => {
    const payload = { createdAt: "2026-01-01T00:00:00Z", id: "abc-123" };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("returns null for an invalid base64 string", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  it("returns null when decoded JSON is missing required fields", () => {
    const bad = Buffer.from(JSON.stringify({ x: 1 })).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeCursor("")).toBeNull();
  });
});

describe("paginate", () => {
  type Item = { id: string; createdAt: string; name: string };

  const makeItems = (n: number): Item[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      createdAt: new Date(1_000_000 + i * 1000).toISOString(),
      name: `item-${i}`,
    }));

  it("returns all items and null cursor when count <= limit", () => {
    const items = makeItems(5);
    const result = paginate(items, 10);
    expect(result.data).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });

  it("slices to limit and sets nextCursor when count > limit", () => {
    const items = makeItems(11); // limit+1 trick
    const result = paginate(items, 10);
    expect(result.data).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });

  it("nextCursor decodes to the last item in the page", () => {
    const items = makeItems(6);
    const { data, nextCursor } = paginate(items, 5);
    const decoded = decodeCursor(nextCursor!);
    expect(decoded).toEqual({ id: data[4]!.id, createdAt: data[4]!.createdAt });
  });

  it("returns empty data and null cursor for empty input", () => {
    const result = paginate([], 10);
    expect(result.data).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

describe("parseLimit", () => {
  it("returns DEFAULT_PAGE_SIZE for undefined", () => {
    expect(parseLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns DEFAULT_PAGE_SIZE for NaN strings", () => {
    expect(parseLimit("abc")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps to MAX_PAGE_SIZE", () => {
    expect(parseLimit(9999)).toBe(MAX_PAGE_SIZE);
  });

  it("floors decimals", () => {
    expect(parseLimit(7.9)).toBe(7);
  });

  it("returns DEFAULT_PAGE_SIZE for 0 or negative", () => {
    expect(parseLimit(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(parseLimit(-5)).toBe(DEFAULT_PAGE_SIZE);
  });
});
