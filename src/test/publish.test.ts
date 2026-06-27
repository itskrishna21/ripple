import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { getBoss, stopBoss } from "../queue/boss";
import { QUEUES } from "../queue/jobs";
import {
  enqueueAnalyze,
  enqueueFetchSource,
  enqueueSnapshotStart,
} from "../queue/publish";

const RUN = Date.now().toString();
const COMP_ID = `test-comp-${RUN}`;
const SNAP_ID = `test-snap-${RUN}`;
const WEEK = "2025-01-06";

const MAIN_QUEUES = [QUEUES.snapshotStart, QUEUES.fetchSource, QUEUES.analyzeSnapshot];

describe("publish helpers", () => {
  let boss: Awaited<ReturnType<typeof getBoss>>;

  beforeAll(async () => {
    boss = await getBoss();
    // Delete and recreate queues for a guaranteed clean slate across test runs.
    // stately policy is re-applied so singletonKey deduplication works correctly.
    for (const q of MAIN_QUEUES) {
      await boss.deleteQueue(q).catch(() => undefined);
      await boss.createQueue(q, { policy: "stately" }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await stopBoss();
  });

  describe("enqueueSnapshotStart", () => {
    it("places a job in the snapshot.start queue with the correct payload", async () => {
      // Always supply a singletonKey so stately policy doesn't deduplicate
      // this test against other no-key sends.
      const key = `places-snap-${RUN}`;
      const id = await boss.send(QUEUES.snapshotStart,
        { competitorId: COMP_ID, weekStart: WEEK },
        { singletonKey: key },
      );
      expect(id).not.toBeNull();
      const job = await boss.getJobById(QUEUES.snapshotStart, id!);
      expect(job?.data).toMatchObject({ competitorId: COMP_ID, weekStart: WEEK });
    });

    it("is idempotent — same singletonKey prevents a duplicate", async () => {
      const key = `idem-snap-${RUN}`;
      const id1 = await boss.send(QUEUES.snapshotStart,
        { competitorId: COMP_ID, weekStart: WEEK },
        { singletonKey: key },
      );
      const id2 = await boss.send(QUEUES.snapshotStart,
        { competitorId: COMP_ID, weekStart: WEEK },
        { singletonKey: key },
      );
      expect(id1).not.toBeNull();
      expect(id2).toBeNull();
    });

    it("enqueueSnapshotStart helper sends with the correct queue and payload", async () => {
      const compId = `helper-snap-start-${RUN}`;
      await enqueueSnapshotStart({ competitorId: compId, weekStart: WEEK });
      const { rows } = await pool.query<{ data: { competitorId: string } }>(
        `SELECT data FROM pgboss.job
         WHERE name = $1 AND data->>'competitorId' = $2 AND state = 'created'`,
        [QUEUES.snapshotStart, compId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.data.competitorId).toBe(compId);
    });
  });

  describe("enqueueFetchSource", () => {
    it("places a job in the fetch.source queue with the correct payload", async () => {
      const key = `places-fetch-${RUN}`;
      const id = await boss.send(QUEUES.fetchSource,
        { snapshotId: SNAP_ID, competitorId: COMP_ID, sourceKey: "website", url: "https://x.com" },
        { singletonKey: key },
      );
      expect(id).not.toBeNull();
      const job = await boss.getJobById(QUEUES.fetchSource, id!);
      expect(job?.data).toMatchObject({ snapshotId: SNAP_ID, sourceKey: "website" });
    });

    it("is idempotent — same singletonKey prevents a duplicate", async () => {
      const key = `idem-fetch-${RUN}:pricing`;
      const id1 = await boss.send(QUEUES.fetchSource,
        { snapshotId: SNAP_ID, competitorId: COMP_ID, sourceKey: "pricing", url: "https://x.com" },
        { singletonKey: key },
      );
      const id2 = await boss.send(QUEUES.fetchSource,
        { snapshotId: SNAP_ID, competitorId: COMP_ID, sourceKey: "pricing", url: "https://x.com" },
        { singletonKey: key },
      );
      expect(id1).not.toBeNull();
      expect(id2).toBeNull();
    });

    it("enqueueFetchSource helper sends with the correct queue and payload", async () => {
      const snapId = `helper-fetch-${RUN}`;
      await enqueueFetchSource({
        snapshotId: snapId, competitorId: COMP_ID,
        sourceKey: "pricing", url: "https://example.com",
      });
      const { rows } = await pool.query<{ data: { snapshotId: string; sourceKey: string } }>(
        `SELECT data FROM pgboss.job
         WHERE name = $1 AND data->>'snapshotId' = $2 AND state = 'created'`,
        [QUEUES.fetchSource, snapId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.data.sourceKey).toBe("pricing");
    });
  });

  describe("enqueueAnalyze", () => {
    it("places a job in the analyze.snapshot queue with the correct payload", async () => {
      const snapId = `places-analyze-${RUN}`;
      const key = `places-analyze-key-${RUN}`;
      const id = await boss.send(QUEUES.analyzeSnapshot,
        { snapshotId: snapId, competitorId: COMP_ID },
        { singletonKey: key },
      );
      expect(id).not.toBeNull();
      const job = await boss.getJobById(QUEUES.analyzeSnapshot, id!);
      expect(job?.data).toMatchObject({ snapshotId: snapId });
    });

    it("is idempotent — same singletonKey prevents a duplicate", async () => {
      const key = `idem-analyze-${RUN}`;
      const id1 = await boss.send(QUEUES.analyzeSnapshot,
        { snapshotId: key, competitorId: COMP_ID },
        { singletonKey: key },
      );
      const id2 = await boss.send(QUEUES.analyzeSnapshot,
        { snapshotId: key, competitorId: COMP_ID },
        { singletonKey: key },
      );
      expect(id1).not.toBeNull();
      expect(id2).toBeNull();
    });

    it("enqueueAnalyze helper sends with the correct queue and payload", async () => {
      const snapId = `helper-analyze-${RUN}`;
      await enqueueAnalyze({ snapshotId: snapId, competitorId: COMP_ID });
      const { rows } = await pool.query<{ data: { snapshotId: string } }>(
        `SELECT data FROM pgboss.job
         WHERE name = $1 AND data->>'snapshotId' = $2 AND state = 'created'`,
        [QUEUES.analyzeSnapshot, snapId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.data.snapshotId).toBe(snapId);
    });
  });
});
