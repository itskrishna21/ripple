/**
 * Cursor-based pagination helpers.
 *
 * A cursor encodes { createdAt: ISO string, id: UUID } as base64 JSON.
 * Queries use (created_at, id) < (cursor.createdAt, cursor.id) for stable,
 * index-friendly descending pagination.
 */

export type CursorPayload = { createdAt: string; id: string };

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as Record<string, unknown>).createdAt === "string" &&
      typeof (parsed as Record<string, unknown>).id === "string"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export type PaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null;
};

/**
 * Given a page of items and the requested limit, builds the paginated response.
 * Callers should query limit+1 rows; if they get limit+1 back there is a next page.
 */
export function paginate<T extends { createdAt: string; id: string }>(
  items: T[],
  limit: number,
): PaginatedResponse<T> {
  if (items.length > limit) {
    const page = items.slice(0, limit);
    const last = page.at(-1);
    return {
      data: page,
      nextCursor: last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }
  return { data: items, nextCursor: null };
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}
