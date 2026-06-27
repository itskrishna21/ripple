/**
 * Data-access layer for the `analyses` table.
 *
 * All tenant-facing reads JOIN back through competitor_snapshots → competitors
 * and filter on company_id — never query by snapshot_id alone (§11.4).
 *
 * Workers write via `upsertAnalysis` (system context, no tenant scope).
 */
import type { PoolClient } from "pg";
import { pool } from "../lib/db";

export type Analysis = {
  id: string;
  snapshotId: string;
  previousSnapshotId: string | null;
  competitorId: string;
  weekStart: string;
  threatScore: number;
  scoreBreakdown: Record<string, number>;
  summary: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
  isBaseline: boolean;
  createdAt: string;
  updatedAt: string;
};

type AnalysisRow = {
  id: string;
  snapshot_id: string;
  previous_snapshot_id: string | null;
  competitor_id: string;
  week_start: Date;
  threat_score: number;
  score_breakdown: Record<string, number>;
  summary: string;
  model: string;
  prompt_version: string;
  policy_version: string;
  is_baseline: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowToAnalysis(row: AnalysisRow): Analysis {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    previousSnapshotId: row.previous_snapshot_id,
    competitorId: row.competitor_id,
    weekStart: row.week_start.toISOString().slice(0, 10),
    threatScore: row.threat_score,
    scoreBreakdown: row.score_breakdown,
    summary: row.summary,
    model: row.model,
    promptVersion: row.prompt_version,
    policyVersion: row.policy_version,
    isBaseline: row.is_baseline,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Worker writes (system context)
// ---------------------------------------------------------------------------

export async function upsertAnalysis(
  client: PoolClient,
  opts: {
    snapshotId: string;
    previousSnapshotId: string | null;
    threatScore: number;
    scoreBreakdown: Record<string, number>;
    summary: string;
    model: string;
    promptVersion: string;
    policyVersion: string;
    isBaseline: boolean;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO analyses
       (snapshot_id, previous_snapshot_id, threat_score, score_breakdown,
        summary, model, prompt_version, policy_version, is_baseline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (snapshot_id) DO UPDATE SET
       previous_snapshot_id = EXCLUDED.previous_snapshot_id,
       threat_score         = EXCLUDED.threat_score,
       score_breakdown      = EXCLUDED.score_breakdown,
       summary              = EXCLUDED.summary,
       model                = EXCLUDED.model,
       prompt_version       = EXCLUDED.prompt_version,
       policy_version       = EXCLUDED.policy_version,
       is_baseline          = EXCLUDED.is_baseline,
       updated_at           = NOW()`,
    [
      opts.snapshotId,
      opts.previousSnapshotId,
      opts.threatScore,
      JSON.stringify(opts.scoreBreakdown),
      opts.summary,
      opts.model,
      opts.promptVersion,
      opts.policyVersion,
      opts.isBaseline,
    ],
  );
}

// ---------------------------------------------------------------------------
// Tenant-scoped reads (API paths — always filter by company_id)
// ---------------------------------------------------------------------------

const SELECT_ANALYSIS = `
  SELECT a.id, a.snapshot_id, a.previous_snapshot_id,
         cs.competitor_id, cs.week_start,
         a.threat_score, a.score_breakdown, a.summary,
         a.model, a.prompt_version, a.policy_version,
         a.is_baseline, a.created_at, a.updated_at
  FROM analyses a
  JOIN competitor_snapshots cs ON cs.id = a.snapshot_id
  JOIN competitors            c  ON c.id  = cs.competitor_id
`;

/** Latest analysis for a specific competitor (tenant-scoped). */
export async function getLatestAnalysisForCompetitor(
  competitorId: string,
  companyId: string,
): Promise<Analysis | null> {
  const result = await pool.query<AnalysisRow>(
    `${SELECT_ANALYSIS}
     WHERE c.id = $1 AND c.company_id = $2
     ORDER BY cs.week_start DESC
     LIMIT 1`,
    [competitorId, companyId],
  );
  const row = result.rows[0];
  return row ? rowToAnalysis(row) : null;
}

/** Latest analysis per competitor for the entire company (dashboard view). */
export async function getLatestAnalysisForAllCompetitors(
  companyId: string,
): Promise<Analysis[]> {
  // DISTINCT ON (competitor_id) + ORDER picks the most recent week per competitor.
  const result = await pool.query<AnalysisRow>(
    `SELECT DISTINCT ON (c.id)
       a.id, a.snapshot_id, a.previous_snapshot_id,
       cs.competitor_id, cs.week_start,
       a.threat_score, a.score_breakdown, a.summary,
       a.model, a.prompt_version, a.policy_version,
       a.is_baseline, a.created_at, a.updated_at
     FROM analyses a
     JOIN competitor_snapshots cs ON cs.id = a.snapshot_id
     JOIN competitors            c  ON c.id  = cs.competitor_id
     WHERE c.company_id = $1
     ORDER BY c.id, cs.week_start DESC`,
    [companyId],
  );
  return result.rows.map(rowToAnalysis);
}

/** Analysis for a specific snapshot (tenant-scoped). */
export async function getAnalysisForSnapshot(
  snapshotId: string,
  companyId: string,
): Promise<Analysis | null> {
  const result = await pool.query<AnalysisRow>(
    `${SELECT_ANALYSIS}
     WHERE a.snapshot_id = $1 AND c.company_id = $2`,
    [snapshotId, companyId],
  );
  const row = result.rows[0];
  return row ? rowToAnalysis(row) : null;
}
