/**
 * Integration tests for the analyze.snapshot pipeline handler.
 *
 * Uses a real Postgres database. The LLM categorize function is mocked
 * so tests are deterministic, free, and don't require LLM_API_KEY.
 */
import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../lib/db";
import { getBoss, stopBoss } from "../queue/boss";
import {
  upsertSnapshot,
  insertSource,
  markSourceOk,
  setSnapshotStatus,
} from "../service/snapshotSourceService";
import { handleAnalyzeSnapshot } from "../pipeline/analyzeSnapshot";
import { QUEUES } from "../queue/jobs";
import type { Job } from "pg-boss";

// Mock the LLM categorize to avoid network calls
vi.mock("../analysis/categorize", () => ({
  PROMPT_VERSION: "v1",
  categorize: vi.fn().mockResolvedValue({
    signals: [
      {
        sourceKey: "pricing",
        category: "pricing_change",
        changeType: "modified",
        severity: 5,
        payload: {},
      },
    ],
    summary: "Pricing changed significantly.",
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEK_A = "2025-01-06";
const WEEK_B = "2025-01-13";

async function setupCompany(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO companies (id, name) VALUES ($1, 'Analyze Test Co') ON CONFLICT DO NOTHING`,
    [id],
  );
}

async function setupCompetitor(
  id: string,
  companyId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO competitors (id, company_id, name, website)
     VALUES ($1, $2, 'AnalyzeComp', 'https://example.com')
     ON CONFLICT DO NOTHING`,
    [id, companyId],
  );
}

function makeJob(snapshotId: string, competitorId: string): Job<{ snapshotId: string; competitorId: string }> {
  return {
    id: randomUUID(),
    name: QUEUES.analyzeSnapshot,
    data: { snapshotId, competitorId },
    priority: 0,
    state: "active",
    retryLimit: 3,
    retryCount: 0,
    retryDelay: 0,
    retryBackoff: false,
    startAfter: new Date(),
    singletonKey: null,
    expire_in: null,
    createdon: new Date(),
    startedon: new Date(),
    completedon: null,
    output: null,
  } as unknown as Job<{ snapshotId: string; competitorId: string }>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeSnapshot — cold start (no previous snapshot)", () => {
  const companyId = randomUUID();
  const competitorId = randomUUID();
  let snapshotId: string;

  beforeAll(async () => {
    await getBoss();
    await setupCompany(companyId);
    await setupCompetitor(competitorId, companyId);

    // Create a snapshot with one ok source
    const snap = await upsertSnapshot(competitorId, WEEK_A);
    snapshotId = snap.id;
    await insertSource(snapshotId, "pricing");
    await markSourceOk(snapshotId, "pricing", {
      contentHash: "abc123",
      storageKey: `${snapshotId}/pricing`,
      normalized: "Price: $10/month",
    });
    await setSnapshotStatus(snapshotId, "completed");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM competitors WHERE id = $1", [competitorId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
  });

  it("writes a baseline analysis with score=0 and is_baseline=true", async () => {
    await handleAnalyzeSnapshot([makeJob(snapshotId, competitorId)]);

    const result = await pool.query<{
      threat_score: number;
      is_baseline: boolean;
      summary: string;
    }>(
      `SELECT threat_score, is_baseline, summary
       FROM analyses WHERE snapshot_id = $1`,
      [snapshotId],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.threat_score).toBe(0);
    expect(result.rows[0]!.is_baseline).toBe(true);
    expect(result.rows[0]!.summary).toContain("Baseline");
  });

  it("sets snapshot status to 'analyzed'", async () => {
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [snapshotId],
    );
    expect(result.rows[0]!.status).toBe("analyzed");
  });
});

describe("analyzeSnapshot — with previous snapshot and content change", () => {
  const companyId = randomUUID();
  const competitorId = randomUUID();
  let prevSnapshotId: string;
  let currSnapshotId: string;

  beforeAll(async () => {
    await setupCompany(companyId);
    await setupCompetitor(competitorId, companyId);

    // Previous snapshot (week A) — will be the baseline
    const prevSnap = await upsertSnapshot(competitorId, WEEK_A);
    prevSnapshotId = prevSnap.id;
    await insertSource(prevSnapshotId, "pricing");
    await markSourceOk(prevSnapshotId, "pricing", {
      contentHash: "hash_old",
      storageKey: `${prevSnapshotId}/pricing`,
      normalized: "Price: $10/month Pro plan",
    });
    await setSnapshotStatus(prevSnapshotId, "analyzed");
    // Write baseline analysis for previous
    await pool.query(
      `INSERT INTO analyses
         (snapshot_id, previous_snapshot_id, threat_score, score_breakdown, summary,
          model, prompt_version, policy_version, is_baseline)
       VALUES ($1, NULL, 0, '{}', 'Baseline', 'gpt-4o-mini', 'v1', 'v1', true)`,
      [prevSnapshotId],
    );

    // Current snapshot (week B) — pricing changed
    const currSnap = await upsertSnapshot(competitorId, WEEK_B);
    currSnapshotId = currSnap.id;
    await insertSource(currSnapshotId, "pricing");
    await markSourceOk(currSnapshotId, "pricing", {
      contentHash: "hash_new", // different hash → diff fires
      storageKey: `${currSnapshotId}/pricing`,
      normalized: "Price: $20/month Pro plan (increased!)",
    });
    await setSnapshotStatus(currSnapshotId, "completed");
  });

  afterAll(async () => {
    // Null out previous_snapshot_id references before cascade deletes snapshots,
    // avoiding FK violation (010_fix_analyses_fk adds ON DELETE SET NULL for
    // future schema, but the test ensures compatibility with older migrations too).
    await pool.query(
      `UPDATE analyses SET previous_snapshot_id = NULL
       WHERE previous_snapshot_id IN (
         SELECT id FROM competitor_snapshots WHERE competitor_id = $1)`,
      [competitorId],
    );
    await pool.query("DELETE FROM competitors WHERE id = $1", [competitorId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    await stopBoss();
    await pool.end();
  });

  it("creates signals and a real threat score > 0", async () => {
    await handleAnalyzeSnapshot([makeJob(currSnapshotId, competitorId)]);

    const analysis = await pool.query<{
      threat_score: number;
      is_baseline: boolean;
      previous_snapshot_id: string;
    }>(
      `SELECT threat_score, is_baseline, previous_snapshot_id
       FROM analyses WHERE snapshot_id = $1`,
      [currSnapshotId],
    );

    expect(analysis.rows).toHaveLength(1);
    expect(analysis.rows[0]!.is_baseline).toBe(false);
    expect(analysis.rows[0]!.threat_score).toBeGreaterThan(0);
    expect(analysis.rows[0]!.previous_snapshot_id).toBe(prevSnapshotId);
  });

  it("inserts signals in the signals table", async () => {
    const signals = await pool.query(
      `SELECT * FROM signals WHERE snapshot_id = $1`,
      [currSnapshotId],
    );
    expect(signals.rows.length).toBeGreaterThan(0);
    expect(signals.rows[0]!.category).toBe("pricing_change");
  });

  it("sets snapshot status to 'analyzed'", async () => {
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM competitor_snapshots WHERE id = $1`,
      [currSnapshotId],
    );
    expect(result.rows[0]!.status).toBe("analyzed");
  });
});
