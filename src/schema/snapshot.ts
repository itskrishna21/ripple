export type SnapshotSourceStatus = "pending" | "ok" | "failed";

export type SnapshotSource = {
  status: SnapshotSourceStatus;
  data?: unknown;
  error?: string;
};

export type SnapshotSources = {
  pricing?: SnapshotSource;
  changelog?: SnapshotSource;
  careers?: SnapshotSource;
  blog?: SnapshotSource;
};

// "fetching" and "analyzing" are in-flight states set by pipeline workers.
export type SnapshotStatus =
  | "pending"
  | "fetching"
  | "completed"
  | "partial"
  | "analyzing"
  | "analyzed"
  | "failed";

export type CompetitorSnapshot = {
  id: string;
  competitorId: string;
  weekStart: string;
  status: SnapshotStatus;
  sources: SnapshotSources;
  createdAt: string;
  updatedAt: string;
};

export const TRACKED_SOURCE_KEYS = [
  "pricing",
  "changelog",
  "careers",
  "blog",
] as const;

export type TrackedSourceKey = (typeof TRACKED_SOURCE_KEYS)[number];

export function createEmptySources(): SnapshotSources {
  return {
    pricing: { status: "pending" },
    changelog: { status: "pending" },
    careers: { status: "pending" },
    blog: { status: "pending" },
  };
}
