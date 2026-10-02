import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { getWeekStart } from "../lib/week";
import { getBoss, stopBoss } from "../queue/boss";
import { enqueueBaselineSnapshot } from "../queue/enqueueBaseline";
import { QUEUES } from "../queue/jobs";
import { handleSnapshotStart } from "../pipeline/snapshotStart";
import type { Job } from "pg-boss";

const RUN = Date.now().toString();
const COMPANY_ID = crypto.randomUUID();
const COMP_ID = crypto.randomUUID();

describe("enqueueBaselineSnapshot", () => {
  beforeAll(async () => {
    await getBoss();
    await pool.query(
      `INSERT INTO companies (id, name) VALUES ($1, 'Baseline Co')`,
      [COMPANY_ID],
    );
    await pool.query(
      `INSERT INTO competitors (id, company_id, name, website, pricing_url)
       VALUES ($1, $2, 'Peer', 'https://example.com', 'https://example.com/pricing')`,
      [COMP_ID, COMPANY_ID],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM companies WHERE id = $1`, [COMPANY_ID]);
    await stopBoss();
  });

  it("queues snapshot.start for this week", async () => {
    await enqueueBaselineSnapshot(COMP_ID);
    const weekStart = getWeekStart();
    const { rows } = await pool.query<{ data: { competitorId: string; weekStart: string } }>(
      `SELECT data FROM pgboss.job
       WHERE name = $1 AND data->>'competitorId' = $2 AND state = 'created'`,
      [QUEUES.snapshotStart, COMP_ID],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.data.weekStart).toBe(weekStart);
  });

  it("is idempotent for the same competitor-week", async () => {
    await enqueueBaselineSnapshot(COMP_ID);
    await enqueueBaselineSnapshot(COMP_ID);
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pgboss.job
       WHERE name = $1 AND data->>'competitorId' = $2`,
      [QUEUES.snapshotStart, COMP_ID],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("snapshot.start creates a snapshot and fetch jobs when URLs exist", async () => {
    const weekStart = getWeekStart();
    const job = {
      id: `baseline-start-${RUN}`,
      name: QUEUES.snapshotStart,
      data: { competitorId: COMP_ID, weekStart },
    } as Job<{ competitorId: string; weekStart: string }>;

    await handleSnapshotStart([job]);

    const snaps = await pool.query<{ id: string }>(
      `SELECT id FROM competitor_snapshots
       WHERE competitor_id = $1 AND week_start = $2`,
      [COMP_ID, weekStart],
    );
    expect(snaps.rows).toHaveLength(1);

    const fetches = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pgboss.job
       WHERE name = $1 AND data->>'snapshotId' = $2`,
      [QUEUES.fetchSource, snaps.rows[0]!.id],
    );
    expect(Number(fetches.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
