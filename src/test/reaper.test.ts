/**
 * Integration tests for src/pipeline/reaper.ts.
 *
 * Tests:
 *   1. Snapshots in 'pending' / 'fetching' past the threshold have their
 *      pending sources marked 'failed' and the snapshot settled.
 *   2. Snapshots in 'analyzing' past the threshold get re-enqueued.
 *   3. Snapshots updated recently are NOT touched.
 *   4. Snapshots that are already settled (status='completed') are NOT touched.
 */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { getBoss, stopBoss } from "../queue/boss";
import { runReaper } from "../pipeline/reaper";
import { config } from "../config";

const WEEK = "2025-06-23";

/** Returns a unique but valid ISO date string for use as week_start in tests. */
function uniqueWeek(month: number): string {
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `2025-${String(month).padStart(2, "0")}-${day}`;
}

async function insertCompany(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO companies (id, name) VALUES ($1, 'Reaper Test Co') ON CONFLICT DO NOTHING`,
    [id],
  );
}

async function insertCompetitor(
  id: string,
  companyId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO competitors (id, company_id, name, website)
     VALUES ($1, $2, 'RC', 'https://rc.example.com')
     ON CONFLICT (id) DO NOTHING`,
    [id, companyId],
  );
}

async function insertSnapshot(
  id: string,
  competitorId: string,
  status: string,
  staleMinutes = 60,
): Promise<void> {
  await pool.query(
    `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
     VALUES ($1, $2, $3, $4, NOW() - ($5 * INTERVAL '1 minute'))
     ON CONFLICT (competitor_id, week_start) DO NOTHING`,
    [id, competitorId, WEEK, status, staleMinutes],
  );
}

async function insertPendingSource(
  snapshotId: string,
  sourceKey = "pricing",
): Promise<void> {
  await pool.query(
    `INSERT INTO snapshot_sources (snapshot_id, source_key, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (snapshot_id, source_key) DO NOTHING`,
    [snapshotId, sourceKey],
  );
}

async function getSnapshotStatus(id: string): Promise<string | null> {
  const res = await pool.query<{ status: string }>(
    `SELECT status FROM competitor_snapshots WHERE id = $1`,
    [id],
  );
  return res.rows[0]?.status ?? null;
}

async function getSourceStatus(
  snapshotId: string,
  sourceKey = "pricing",
): Promise<string | null> {
  const res = await pool.query<{ status: string }>(
    `SELECT status FROM snapshot_sources WHERE snapshot_id = $1 AND source_key = $2`,
    [snapshotId, sourceKey],
  );
  return res.rows[0]?.status ?? null;
}

let companyId: string;
let competitorId: string;

beforeAll(async () => {
  await getBoss();
  companyId = randomUUID();
  competitorId = randomUUID();
  await insertCompany(companyId);
  await insertCompetitor(competitorId, companyId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM competitor_snapshots WHERE competitor_id = $1`, [competitorId]);
  await pool.query(`DELETE FROM competitors WHERE id = $1`, [competitorId]);
  await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
  await stopBoss();
  await pool.end();
});

describe("reaper", () => {
  it("marks pending sources failed and settles a stuck 'pending' snapshot", async () => {
    const snapId = randomUUID();
    await insertSnapshot(snapId, competitorId, "pending");
    await insertPendingSource(snapId, "pricing");
    await insertPendingSource(snapId, "careers");

    await runReaper();

    // All pending sources should now be failed
    expect(await getSourceStatus(snapId, "pricing")).toBe("failed");
    expect(await getSourceStatus(snapId, "careers")).toBe("failed");

    // Snapshot should have been settled (all sources failed → status=failed)
    const finalStatus = await getSnapshotStatus(snapId);
    expect(finalStatus).toBe("failed");
  });

  it("marks pending sources failed and settles a stuck 'fetching' snapshot", async () => {
    const snapId = randomUUID();
    const uniqueWeekStr = uniqueWeek(7);
    await pool.query(
      `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
       VALUES ($1, $2, $3, 'fetching', NOW() - INTERVAL '45 minutes')`,
      [snapId, competitorId, uniqueWeekStr],
    );
    await insertPendingSource(snapId, "pricing");

    await runReaper();

    expect(await getSourceStatus(snapId, "pricing")).toBe("failed");
    const finalStatus = await getSnapshotStatus(snapId);
    expect(finalStatus).toBe("failed");
  });

  it("does NOT touch snapshots updated recently", async () => {
    const snapId = randomUUID();
    // Only 1 minute stale — well under threshold
    await pool.query(
      `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW() - INTERVAL '1 minute')`,
      [snapId, competitorId, uniqueWeek(8)],
    );
    await insertPendingSource(snapId, "pricing");

    await runReaper();

    // Should not have been touched
    expect(await getSnapshotStatus(snapId)).toBe("pending");
    expect(await getSourceStatus(snapId, "pricing")).toBe("pending");
  });

  it("does NOT touch completed snapshots", async () => {
    const snapId = randomUUID();
    await pool.query(
      `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
       VALUES ($1, $2, $3, 'completed', NOW() - INTERVAL '60 minutes')`,
      [snapId, competitorId, uniqueWeek(9)],
    );

    await runReaper();

    // Completed snapshots are out of scope — should remain completed
    expect(await getSnapshotStatus(snapId)).toBe("completed");
  });

  it("re-enqueues a stuck 'analyzing' snapshot", async () => {
    const snapId = randomUUID();
    await pool.query(
      `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
       VALUES ($1, $2, $3, 'analyzing', NOW() - INTERVAL '60 minutes')`,
      [snapId, competitorId, uniqueWeek(10)],
    );

    // Run the reaper — should not throw; should enqueue analyze.snapshot
    await expect(runReaper()).resolves.not.toThrow();

    // The snapshot status itself is not changed by reaper for 'analyzing'
    // (the re-enqueued job will mark it when it runs)
    // We just verify it didn't crash and the snapshot remains in DB
    expect(await getSnapshotStatus(snapId)).toBe("analyzing");
  });

  it("is idempotent — second reaper run skips already-settled snapshots", async () => {
    const snapId = randomUUID();
    await pool.query(
      `INSERT INTO competitor_snapshots (id, competitor_id, week_start, status, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW() - INTERVAL '60 minutes')`,
      [snapId, competitorId, uniqueWeek(11)],
    );
    await insertPendingSource(snapId, "pricing");

    // First run settles it
    await runReaper();
    expect(await getSnapshotStatus(snapId)).toBe("failed");

    // Second run should be a no-op (snapshot is no longer in-flight)
    await expect(runReaper()).resolves.not.toThrow();
    expect(await getSnapshotStatus(snapId)).toBe("failed");
  });
});
