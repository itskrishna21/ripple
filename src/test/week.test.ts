import { describe, it, expect } from "vitest";
import { getWeekStart } from "../lib/week";

describe("getWeekStart", () => {
  it("returns a Monday when given a Monday", () => {
    // 2026-06-22 is a Monday
    const result = getWeekStart(new Date("2026-06-22T12:00:00Z"));
    expect(result).toBe("2026-06-22");
  });

  it("returns the preceding Monday when given a Wednesday", () => {
    // 2026-06-24 is a Wednesday → Monday is 2026-06-22
    const result = getWeekStart(new Date("2026-06-24T00:00:00Z"));
    expect(result).toBe("2026-06-22");
  });

  it("returns the preceding Monday when given a Sunday", () => {
    // 2026-06-28 is a Sunday → preceding Monday is 2026-06-22
    const result = getWeekStart(new Date("2026-06-28T00:00:00Z"));
    expect(result).toBe("2026-06-22");
  });

  it("returns the preceding Monday when given a Saturday", () => {
    // 2026-06-27 is a Saturday → preceding Monday is 2026-06-22
    const result = getWeekStart(new Date("2026-06-27T00:00:00Z"));
    expect(result).toBe("2026-06-22");
  });

  it("returns YYYY-MM-DD format", () => {
    const result = getWeekStart(new Date("2026-06-22T00:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
