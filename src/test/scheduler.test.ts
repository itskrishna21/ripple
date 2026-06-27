import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { getBoss, stopBoss } from "../queue/boss";
import { QUEUES } from "../queue/jobs";
import { runWeeklyEnqueue } from "../process/scheduler";

/**
 * Scheduler integration tests.
 *
 * runWeeklyEnqueue reads all competitors from the DB and fans out
 * one snapshot.start job per competitor. We insert test rows, run it,
 * then verify the correct number of jobs were enqueued.
 */

const TEST_COMPANY_ID = randomUUID();
const RUN = Date.now().toString();

async function insertTestCompetitor(id: string, name: string): Promise<void> {
  await pool.query(
    `INSERT INTO competitors (id, company_id, name, website)
     VALUES ($1, $2, $3, 'https://example.com')
     ON CONFLICT (id) DO NOTHING`,
    [id, TEST_COMPANY_ID, name],
  );
}

async function deleteTestCompetitor(id: string): Promise<void> {
  await pool.query("DELETE FROM competitors WHERE id = $1", [id]);
}

/** Complete (drain) all created/active snapshot.start jobs for a given competitor. */
async function drainJobsForComp(
  boss: Awaited<ReturnType<typeof getBoss>>,
  compId: string,
): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const jobs = await boss.fetch<{ competitorId: string }>(QUEUES.snapshotStart);
    if (!jobs || jobs.length === 0) break;
    for (const job of jobs) {
      await boss.complete(QUEUES.snapshotStart, job.id);
      // Put back jobs that aren't ours so they aren't lost.
      if (job.data.competitorId !== compId) {
        // We can't "un-fetch" a job, but we can complete it —
        // competitor jobs from other tests will just be orphaned
        // (no active worker to consume them anyway).
      }
    }
  }
}

describe("scheduler — runWeeklyEnqueue", () => {
  const compA = randomUUID();
  const compB = randomUUID();

  let boss: Awaited<ReturnType<typeof getBoss>>;

  beforeAll(async () => {
    boss = await getBoss();
    await pool.query(
      `INSERT INTO companies (id, name) VALUES ($1, 'Test Co')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_COMPANY_ID],
    );
    await insertTestCompetitor(compA, `Sched Comp A ${RUN}`);
    await insertTestCompetitor(compB, `Sched Comp B ${RUN}`);
  });

  afterAll(async () => {
    await deleteTestCompetitor(compA);
    await deleteTestCompetitor(compB);
    await stopBoss();
    await pool.end();
  });

  it("enqueues one snapshot.start job per competitor in the DB", async () => {
    await runWeeklyEnqueue();

    // Read the job IDs via getJobById instead of consuming them, so the
    // idempotency test can still check deduplication against "created" jobs.
    // We'll look for our two competitors by querying the pgboss.job table.
    const result = await pool.query<{ data: { competitorId: string } }>(
      `SELECT data FROM pgboss.job
       WHERE name = $1
         AND state = 'created'
         AND data->>'competitorId' = ANY($2)`,
      [QUEUES.snapshotStart, [compA, compB]],
    );

    const found = new Set(result.rows.map((r) => r.data.competitorId));
    expect(found.has(compA)).toBe(true);
    expect(found.has(compB)).toBe(true);
  });

  it("is idempotent — running twice does not double-enqueue", async () => {
    // Jobs from the first test are still in "created" state.
    // singletonKey prevents duplicates against created/retry jobs.
    await runWeeklyEnqueue();
    await runWeeklyEnqueue();

    const result = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM pgboss.job
       WHERE name = $1
         AND state = 'created'
         AND data->>'competitorId' = ANY($2)`,
      [QUEUES.snapshotStart, [compA, compB]],
    );

    // With singletonKey dedup, only 1 job per competitor should exist.
    expect(Number(result.rows[0].count)).toBeLessThanOrEqual(2);
  });
});
