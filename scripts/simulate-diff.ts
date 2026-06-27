/**
 * Phase 2 simulation: show the diff + score path.
 *
 * Creates a competitor with a seeded "week 1" baseline snapshot (pre-analyzed),
 * then creates a "week 2" current snapshot with different normalized content,
 * and runs the analyzeSnapshot handler directly — demonstrating:
 *   - diffSource (pricing + careers change detected)
 *   - categorize (deterministic stub — no LLM key needed)
 *   - insertSignals → scoreSignals(storedRows) → upsertAnalysis
 *   - final threat score surfaced via the API
 */

import "dotenv/config";
import { randomUUID } from "crypto";
import { pool } from "../src/lib/db";
import { getBoss, stopBoss } from "../src/queue/boss";
import { handleAnalyzeSnapshot } from "../src/pipeline/analyzeSnapshot";
import { QUEUES } from "../src/queue/jobs";
import type { Job } from "pg-boss";

const BASE = "http://localhost:3000";

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

function makeAnalyzeJob(
  snapshotId: string,
  competitorId: string,
): Job<{ snapshotId: string; competitorId: string }> {
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

const sep = () => console.log("\n" + "─".repeat(60));
const section = (t: string) => { sep(); console.log(`  ${t}`); sep(); };
const log = (label: string, v: unknown) => {
  console.log(`\n  ${label}:`);
  console.log(JSON.stringify(v, null, 4).split("\n").map(l => "  " + l).join("\n"));
};

async function simulate() {
  console.log("\n🔄  Ripple — Week 2 Diff & Scoring Simulation");

  // ── Get auth token ──────────────────────────────────────────────────────
  section("1. Signup + Signin");
  const email = `diff-sim-${Date.now()}@ripple.local`;
  const password = "DiffSim123!";

  // Signup creates user + company (returns { user, company } — no token)
  const signup = await api<{ user: { companyId: string } }>("POST", "/auth/signup", {
    email, password, companyName: "Diff Sim Co",
  });
  console.log(`\n  ✓ Signed up: ${email}`);

  // Signin returns the Firebase ID token
  const { token } = await api<{ token: string }>("POST", "/auth/signin", { email, password });
  console.log(`  ✓ Token: ${token.slice(0, 30)}…`);

  // ── Create a fresh competitor for this simulation ───────────────────────
  section("2. Create fresh competitor: 'CompetitorCo'");
  const competitor = await api<{ id: string; name: string }>(
    "POST",
    "/competitors",
    { name: "CompetitorCo", website: "https://competitorco.example", pricingUrl: "https://example.com" },
    token,
  );
  const competitorId = competitor.id;
  log("competitor", competitor);

  // ── Seed week 1 (baseline) snapshot directly in DB ────────────────────
  section("3. Seed week 1 baseline snapshot (already analyzed)");
  const WEEK1 = "2026-06-15";
  const WEEK2 = "2026-06-22";

  // Week 1 snapshot
  const w1Snap = await pool.query<{ id: string }>(
    `INSERT INTO competitor_snapshots (competitor_id, week_start, status, sources)
     VALUES ($1, $2, 'analyzed', '{}') RETURNING id`,
    [competitorId, WEEK1],
  );
  const w1Id = w1Snap.rows[0]!.id;

  // Week 1 sources with specific normalized content
  await pool.query(
    `INSERT INTO snapshot_sources
       (snapshot_id, source_key, status, content_hash, storage_key, normalized)
     VALUES
       ($1, 'pricing', 'ok', 'old_hash_pricing', 'w1/pricing',
        'Starter Plan $9 per month. Pro Plan $29 per month. Enterprise contact us.')`,
    [w1Id],
  );

  // Week 1 baseline analysis (no previous)
  await pool.query(
    `INSERT INTO analyses
       (snapshot_id, previous_snapshot_id, threat_score, score_breakdown,
        summary, model, prompt_version, policy_version, is_baseline)
     VALUES ($1, NULL, 0, '{}', 'Baseline snapshot.', 'gpt-4o-mini', 'v1', 'v1', true)`,
    [w1Id],
  );

  console.log(`\n  ✓ Week 1 snapshot (${WEEK1}): id=${w1Id}`);
  console.log("    pricing: 'Starter $9/mo · Pro $29/mo · Enterprise contact us'");

  // ── Seed week 2 snapshot (completed, different content) ────────────────
  section("4. Seed week 2 snapshot with changed content");

  const w2Snap = await pool.query<{ id: string }>(
    `INSERT INTO competitor_snapshots (competitor_id, week_start, status, sources)
     VALUES ($1, $2, 'completed', '{}') RETURNING id`,
    [competitorId, WEEK2],
  );
  const w2Id = w2Snap.rows[0]!.id;

  // Week 2 pricing changed — Pro plan raised from $29 → $49; added Enterprise $99
  await pool.query(
    `INSERT INTO snapshot_sources
       (snapshot_id, source_key, status, content_hash, storage_key, normalized)
     VALUES
       ($1, 'pricing', 'ok', 'new_hash_pricing', 'w2/pricing',
        'Starter Plan $9 per month. Pro Plan $49 per month. Enterprise Plan $99 per month.')`,
    [w2Id],
  );

  console.log(`\n  ✓ Week 2 snapshot (${WEEK2}): id=${w2Id}`);
  console.log("    pricing: 'Starter $9/mo · Pro $49/mo (+$20) · Enterprise $99/mo (new!)'");
  console.log("\n  Hashes differ → diff will fire → candidates → categorize → score");

  // ── Run the analyze handler ────────────────────────────────────────────
  section("5. Run analyze.snapshot handler");
  console.log("\n  (LLM_API_KEY not set → deterministic stub categorization)");
  await getBoss(); // ensure analyze's enqueueAnalyze (if settle fires) has a boss
  await handleAnalyzeSnapshot([makeAnalyzeJob(w2Id, competitorId)]);
  console.log("\n  ✓ Handler complete");

  // ── Show results ──────────────────────────────────────────────────────
  section("6. Results: signals + analysis");

  const signals = await pool.query(
    `SELECT source_key, category, change_type, severity, payload
     FROM signals WHERE snapshot_id = $1`,
    [w2Id],
  );
  log("signals (categorized changes)", signals.rows);

  const analysis = await pool.query(
    `SELECT threat_score, score_breakdown, summary, is_baseline, previous_snapshot_id
     FROM analyses WHERE snapshot_id = $1`,
    [w2Id],
  );
  log("analysis row", analysis.rows[0]);

  const snapStatus = await pool.query(
    `SELECT status FROM competitor_snapshots WHERE id = $1`,
    [w2Id],
  );
  log("snapshot status", snapStatus.rows[0]);

  // ── Query via real API ─────────────────────────────────────────────────
  section("7. GET /competitors/:id/analysis (tenant-scoped API)");
  const apiAnalysis = await api<unknown>(
    "GET", `/competitors/${competitorId}/analysis`, undefined, token,
  );
  log("API response", apiAnalysis);

  sep();
  console.log("\n  ✅  Diff simulation complete!");
  console.log("     threat_score:", (analysis.rows[0] as { threat_score: number }).threat_score);
  console.log("     signals:", signals.rows.length);
  console.log("     (add LLM_API_KEY to .env for real GPT-4o-mini categorization)\n");
}

simulate()
  .catch(err => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await stopBoss().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
