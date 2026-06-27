/**
 * analyze.snapshot handler.
 *
 * Flow (§5.4):
 *   1. Get current snapshot + its ok sources (with normalized content).
 *   2. Get previous snapshot (most recent completed/partial/analyzed).
 *   3. Cold start: if no previous → write baseline analysis (score=0, no LLM).
 *   4. For each ok source: if prev has it and hash differs → diffSource.
 *   5. If no candidates → write "no changes" analysis.
 *   6. Otherwise: categorize (LLM) → TX { insertSignals → scoreSignals(stored) → upsertAnalysis → setStatus }.
 *
 * The TX in step 6 is the critical write-once boundary:
 *   - insertSignals first, then score FROM stored rows (not from LLM output).
 *   - setSnapshotStatus('analyzed') inside the same TX → atomic.
 */
import type { Job } from "pg-boss";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { config } from "../config";
import { AnalyzeSnapshotJob } from "../queue/jobs";
import { diffSource } from "../diff/index";
import { categorize, PROMPT_VERSION } from "../analysis/categorize";
import { scoreSignals, POLICY_VERSION } from "../analysis/score";
import { insertSignals, getSignalsForSnapshot } from "../service/signalService";
import { upsertAnalysis } from "../service/analysisService";
import { TrackedSourceKey } from "../schema/snapshot";

// ---------------------------------------------------------------------------
// DB helpers (system-context, no company_id scope)
// ---------------------------------------------------------------------------

type SnapshotSourceInfo = {
  sourceKey: TrackedSourceKey;
  contentHash: string | null;
  normalized: string | null;
};

type SnapshotInfo = {
  id: string;
  competitorId: string;
  weekStart: string;
  status: string;
  sources: SnapshotSourceInfo[];
};

async function getSnapshotWithOkSources(
  snapshotId: string,
): Promise<SnapshotInfo | null> {
  const snapResult = await pool.query<{
    id: string;
    competitor_id: string;
    week_start: Date;
    status: string;
  }>(
    `SELECT id, competitor_id, week_start, status
     FROM competitor_snapshots WHERE id = $1`,
    [snapshotId],
  );
  const snap = snapResult.rows[0];
  if (!snap) return null;

  const sourceResult = await pool.query<{
    source_key: TrackedSourceKey;
    content_hash: string | null;
    normalized: string | null;
  }>(
    `SELECT source_key, content_hash, normalized
     FROM snapshot_sources WHERE snapshot_id = $1 AND status = 'ok'`,
    [snapshotId],
  );

  return {
    id: snap.id,
    competitorId: snap.competitor_id,
    weekStart: snap.week_start.toISOString().slice(0, 10),
    status: snap.status,
    sources: sourceResult.rows.map((r) => ({
      sourceKey: r.source_key,
      contentHash: r.content_hash,
      normalized: r.normalized,
    })),
  };
}

async function getPreviousSnapshot(
  competitorId: string,
  weekStart: string,
): Promise<SnapshotInfo | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM competitor_snapshots
     WHERE competitor_id = $1
       AND week_start < $2
       AND status IN ('completed', 'partial', 'analyzed')
     ORDER BY week_start DESC
     LIMIT 1`,
    [competitorId, weekStart],
  );
  const row = result.rows[0];
  if (!row) return null;
  return getSnapshotWithOkSources(row.id);
}

async function setSnapshotStatusInTx(
  client: import("pg").PoolClient,
  snapshotId: string,
  status: string,
): Promise<void> {
  await client.query(
    `UPDATE competitor_snapshots SET status = $2, updated_at = NOW() WHERE id = $1`,
    [snapshotId, status],
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAnalyzeSnapshot(
  jobs: Job<AnalyzeSnapshotJob>[],
): Promise<void> {
  for (const job of jobs) {
    const { snapshotId, competitorId } = job.data;
    const log = logger.child({ jobId: job.id, snapshotId, competitorId });

    try {
      await analyzeOne(snapshotId, competitorId, log);
    } catch (err) {
      log.error({ err }, "analyze.snapshot handler failed — will retry");
      throw err;
    }
  }
}

async function analyzeOne(
  snapshotId: string,
  competitorId: string,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const current = await getSnapshotWithOkSources(snapshotId);
  if (!current) {
    log.warn({}, "snapshot not found — dropping job");
    return;
  }

  // Mark as analyzing (best-effort, non-transactional — reaper handles crashes)
  await pool
    .query(
      `UPDATE competitor_snapshots SET status = 'analyzing', updated_at = NOW() WHERE id = $1`,
      [snapshotId],
    )
    .catch((e) => log.warn({ e }, "failed to set analyzing status"));

  const previous = await getPreviousSnapshot(competitorId, current.weekStart);

  // -------------------------------------------------------------------------
  // Cold start — no previous snapshot for this competitor
  // -------------------------------------------------------------------------
  if (!previous) {
    log.info({}, "cold start — writing baseline analysis");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await upsertAnalysis(client, {
        snapshotId,
        previousSnapshotId: null,
        threatScore: 0,
        scoreBreakdown: {},
        summary: "Baseline snapshot — tracking started, no changes yet.",
        model: config.LLM_MODEL,
        promptVersion: PROMPT_VERSION,
        policyVersion: POLICY_VERSION,
        isBaseline: true,
      });
      await setSnapshotStatusInTx(client, snapshotId, "analyzed");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Build a map of previous sources for fast lookup
  // -------------------------------------------------------------------------
  const prevSourceMap = new Map<
    TrackedSourceKey,
    { contentHash: string | null; normalized: string | null }
  >(previous.sources.map((s) => [s.sourceKey, s]));

  // -------------------------------------------------------------------------
  // Diff each current ok source against the previous version
  // -------------------------------------------------------------------------
  const candidates: ReturnType<typeof diffSource> = [];

  for (const src of current.sources) {
    const prev = prevSourceMap.get(src.sourceKey);

    if (!prev) {
      // Source is new this week — baseline for this source, skip (§8.4)
      log.debug({ sourceKey: src.sourceKey }, "new source this week — skipping diff");
      continue;
    }

    if (src.contentHash && prev.contentHash && src.contentHash === prev.contentHash) {
      // Unchanged — fast-path skip
      log.debug({ sourceKey: src.sourceKey }, "content unchanged — skipping diff");
      continue;
    }

    if (!src.normalized || !prev.normalized) {
      // Missing normalized content (e.g. backfilled historical row) — skip
      continue;
    }

    const diffs = diffSource(src.sourceKey, prev.normalized, src.normalized);
    candidates.push(...diffs);
  }

  // -------------------------------------------------------------------------
  // No candidates → no-change analysis (no LLM, no signals)
  // -------------------------------------------------------------------------
  if (candidates.length === 0) {
    log.info({}, "no changes detected — writing no-change analysis");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await upsertAnalysis(client, {
        snapshotId,
        previousSnapshotId: previous.id,
        threatScore: 0,
        scoreBreakdown: {},
        summary: "No significant changes detected this week.",
        model: config.LLM_MODEL,
        promptVersion: PROMPT_VERSION,
        policyVersion: POLICY_VERSION,
        isBaseline: false,
      });
      await setSnapshotStatusInTx(client, snapshotId, "analyzed");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Categorize via LLM (only LLM step — §8.1)
  // -------------------------------------------------------------------------
  log.info({ candidateCount: candidates.length }, "categorizing candidates");
  const analysisOutput = await categorize(candidates);

  // -------------------------------------------------------------------------
  // TX: insertSignals → score from stored → upsertAnalysis → setStatus
  // Scoring from the DB rows (not the LLM response) is what makes scoring
  // deterministic and re-runnable (§8.2).
  // -------------------------------------------------------------------------
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await insertSignals(client, snapshotId, analysisOutput.signals);

    const storedSignals = await getSignalsForSnapshot(client, snapshotId);
    const { score, breakdown } = scoreSignals(storedSignals);

    await upsertAnalysis(client, {
      snapshotId,
      previousSnapshotId: previous.id,
      threatScore: score,
      scoreBreakdown: breakdown,
      summary: analysisOutput.summary,
      model: config.LLM_MODEL,
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
      isBaseline: false,
    });

    await setSnapshotStatusInTx(client, snapshotId, "analyzed");
    await client.query("COMMIT");

    log.info(
      { score, signalCount: storedSignals.length },
      "snapshot analyzed",
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
