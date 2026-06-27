import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBoss, stopBoss } from "../queue/boss";
import { QUEUES } from "../queue/jobs";

/**
 * Job infrastructure tests: prove that pg-boss can send → verify → complete
 * a job for each application queue. Always uses explicit singletonKeys so the
 * stately policy doesn't deduplicate test sends against null-key jobs from
 * other test files.
 */

const RUN = Date.now().toString();
const MAIN_QUEUES = [QUEUES.snapshotStart, QUEUES.fetchSource, QUEUES.analyzeSnapshot];

describe("worker job processing (end-to-end round trip)", () => {
  let boss: Awaited<ReturnType<typeof getBoss>>;

  beforeAll(async () => {
    boss = await getBoss();
    // Fresh queues for this test file — avoids stale jobs from other test files.
    for (const q of MAIN_QUEUES) {
      await boss.deleteQueue(q).catch(() => undefined);
      await boss.createQueue(q, { policy: "stately" }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await stopBoss();
  });

  it("snapshot.start: send → verify payload → complete", async () => {
    const key = `worker-snap-${RUN}`;
    const payload = { competitorId: key, weekStart: "2025-01-06" };
    const id = await boss.send(QUEUES.snapshotStart, payload, { singletonKey: key });
    expect(id).not.toBeNull();

    const job = await boss.getJobById(QUEUES.snapshotStart, id!);
    expect(job).not.toBeNull();
    expect(job!.data).toMatchObject(payload);

    await boss.complete(QUEUES.snapshotStart, id!);
  });

  it("fetch.source: send → verify payload → complete", async () => {
    const key = `worker-fetch-${RUN}`;
    const payload = {
      snapshotId: key,
      competitorId: `comp-${RUN}`,
      sourceKey: "website",
      url: "https://example.com",
    };
    const id = await boss.send(QUEUES.fetchSource, payload, { singletonKey: key });
    expect(id).not.toBeNull();

    const job = await boss.getJobById(QUEUES.fetchSource, id!);
    expect(job).not.toBeNull();
    expect(job!.data).toMatchObject({ snapshotId: key, sourceKey: "website" });

    await boss.complete(QUEUES.fetchSource, id!);
  });

  it("analyze.snapshot: send → verify payload → complete", async () => {
    const key = `worker-analyze-${RUN}`;
    const payload = { snapshotId: key, competitorId: `comp-${RUN}` };
    const id = await boss.send(QUEUES.analyzeSnapshot, payload, { singletonKey: key });
    expect(id).not.toBeNull();

    const job = await boss.getJobById(QUEUES.analyzeSnapshot, id!);
    expect(job).not.toBeNull();
    expect(job!.data).toMatchObject(payload);

    await boss.complete(QUEUES.analyzeSnapshot, id!);
  });
});
