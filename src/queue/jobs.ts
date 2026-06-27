import type { TrackedSourceKey } from "../schema/snapshot";

export const QUEUES = {
  snapshotStart: "snapshot.start",
  fetchSource: "fetch.source",
  analyzeSnapshot: "analyze.snapshot",
  // Dead-letter queues — exhausted jobs land here for inspection/replay.
  snapshotStartDlq: "snapshot.start.dlq",
  fetchSourceDlq: "fetch.source.dlq",
  analyzeSnapshotDlq: "analyze.snapshot.dlq",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type SnapshotStartJob = {
  competitorId: string;
  weekStart: string;
};

export type FetchSourceJob = {
  snapshotId: string;
  competitorId: string;
  sourceKey: TrackedSourceKey;
  url: string;
};

export type AnalyzeSnapshotJob = {
  snapshotId: string;
  competitorId: string;
};
