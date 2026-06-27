/**
 * End-to-end simulation of the Ripple pipeline.
 *
 * What this demonstrates:
 *   1. Health + ready endpoints
 *   2. Auth — signup + signin (Firebase)
 *   3. Competitor CRUD — create competitor with source URLs
 *   4. Ingestion — enqueue snapshot.start, worker fetches sources
 *   5. Intelligence — worker diffs, categorizes (stub), scores, writes analysis
 *   6. Read API — GET /competitors/:id/analysis and GET /analysis
 *
 * Run with:
 *   npx tsx scripts/simulate.ts
 *
 * Requires web + worker to be running:
 *   PROCESS_TYPE=web  npx tsx src/index.ts
 *   PROCESS_TYPE=worker npx tsx src/index.ts
 */

import "dotenv/config";
import { getBoss } from "../src/queue/boss";
import { enqueueSnapshotStart } from "../src/queue/publish";
import { pool } from "../src/lib/db";
import { getWeekStart } from "../src/lib/week";

const BASE = "http://localhost:3000";
const WEEK = getWeekStart();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
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

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const sep = () => console.log("\n" + "─".repeat(60));

function section(title: string) {
  sep();
  console.log(`  ${title}`);
  sep();
}

function log(label: string, value: unknown) {
  console.log(`\n  ${label}:`);
  console.log(JSON.stringify(value, null, 4).split("\n").map(l => "  " + l).join("\n"));
}

// ---------------------------------------------------------------------------
// Poll helpers
// ---------------------------------------------------------------------------
async function waitForSnapshotStatus(
  snapshotId: string,
  target: string[],
  timeoutMs = 60_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await pool.query<{ status: string }>(
      "SELECT status FROM competitor_snapshots WHERE id = $1",
      [snapshotId],
    );
    const status = result.rows[0]?.status;
    if (status && target.includes(status)) return status;
    process.stdout.write(`    ⏳ snapshot ${status ?? "?"} → waiting for ${target.join("|")}...\r`);
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`Timeout waiting for snapshot status ${target.join("|")}`);
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------
async function simulate() {
  console.log("\n🚀  Ripple Pipeline Simulation");
  console.log("     week:", WEEK);

  // ── 1. Health checks ──────────────────────────────────────────────────────
  section("1. Health & ready checks");
  const health = await api<{ status: string }>("GET", "/health");
  log("GET /health", health);
  const ready = await api<{ status: string }>("GET", "/ready");
  log("GET /ready", ready);

  // ── 2. Signup ─────────────────────────────────────────────────────────────
  section("2. Auth — signup");
  const email = `sim-${Date.now()}@ripple-test.local`;
  const password = "Simulate123!";
  let token: string;

  try {
    const signupRes = await api<{ token: string }>("POST", "/auth/signup", {
      email,
      password,
      companyName: "Acme Corp",
    });
    token = signupRes.token;
    log("POST /auth/signup", { email, token: `${token.slice(0, 20)}…` });
  } catch (err) {
    // Firebase might rate-limit; try signin if account already exists
    console.log("  signup failed, trying signin:", (err as Error).message);
    const signinRes = await api<{ token: string }>("POST", "/auth/signin", { email, password });
    token = signinRes.token;
    log("POST /auth/signin (fallback)", { email, token: `${token.slice(0, 20)}…` });
  }

  // ── 3. Create competitor ──────────────────────────────────────────────────
  section("3. Create competitor with source URLs");
  const competitor = await api<{ id: string; name: string }>(
    "POST",
    "/competitors",
    {
      name: "Stripe",
      website: "https://stripe.com",
      pricingUrl: "https://stripe.com/pricing",
      changelogUrl: "https://stripe.com/blog",
      careersUrl: "https://stripe.com/jobs",
    },
    token,
  );
  log("POST /competitors", competitor);
  const competitorId = competitor.id;

  // ── 4. Enqueue snapshot.start ─────────────────────────────────────────────
  section("4. Enqueue snapshot.start (triggers fetch pipeline)");
  await enqueueSnapshotStart({ competitorId, weekStart: WEEK });
  console.log("\n  ✓ snapshot.start enqueued for week:", WEEK);
  console.log("  Worker will pick up → fetch source URLs → settle → enqueue analyze");

  // ── 5. Wait for snapshot to be created ────────────────────────────────────
  section("5. Waiting for snapshot to be fetched & analyzed…");

  // Find the snapshot ID created by snapshot.start
  let snapshotId: string | undefined;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !snapshotId) {
    const result = await pool.query<{ id: string }>(
      "SELECT id FROM competitor_snapshots WHERE competitor_id = $1 AND week_start = $2",
      [competitorId, WEEK],
    );
    snapshotId = result.rows[0]?.id;
    if (!snapshotId) await new Promise(r => setTimeout(r, 1000));
  }

  if (!snapshotId) {
    throw new Error("Snapshot was never created — is the worker running?");
  }
  console.log("\n  ✓ Snapshot created:", snapshotId);

  // Wait for terminal state
  const finalStatus = await waitForSnapshotStatus(
    snapshotId,
    ["analyzed", "failed", "partial"],
    90_000,
  );
  console.log(`\n\n  ✓ Snapshot reached terminal state: ${finalStatus}`);

  // ── 6. Read snapshot + sources ─────────────────────────────────────────────
  section("6. Snapshot & sources (from DB)");
  const snapResult = await pool.query(
    `SELECT id, status, week_start FROM competitor_snapshots WHERE id = $1`,
    [snapshotId],
  );
  log("competitor_snapshots row", snapResult.rows[0]);

  const srcResult = await pool.query(
    `SELECT source_key, status, content_hash, error
     FROM snapshot_sources WHERE snapshot_id = $1`,
    [snapshotId],
  );
  log("snapshot_sources rows", srcResult.rows);

  // ── 7. Analysis API ────────────────────────────────────────────────────────
  section("7. GET /competitors/:id/analysis (tenant-scoped API)");
  const analysis = await api<unknown>(`GET`, `/competitors/${competitorId}/analysis`, undefined, token);
  log("analysis response", analysis);

  section("8. GET /analysis (dashboard — latest per competitor)");
  const allAnalysis = await api<unknown[]>("GET", "/analysis", undefined, token);
  log("all analyses", allAnalysis);

  // ── 8. Signals ─────────────────────────────────────────────────────────────
  if (finalStatus !== "analyzed") {
    console.log("\n  ⚠ Snapshot did not reach 'analyzed' — signals may not exist.");
  } else {
    section("9. Signals written by analyze.snapshot handler");
    const sigResult = await pool.query(
      `SELECT source_key, category, change_type, severity, payload
       FROM signals WHERE snapshot_id = $1`,
      [snapshotId],
    );
    log("signals", sigResult.rows.length > 0 ? sigResult.rows : "(none — baseline or no changes)");

    const analysisRow = await pool.query(
      `SELECT threat_score, score_breakdown, summary, is_baseline, prompt_version, policy_version
       FROM analyses WHERE snapshot_id = $1`,
      [snapshotId],
    );
    log("analyses row", analysisRow.rows[0]);
  }

  sep();
  console.log("\n  ✅  Simulation complete!\n");
}

simulate()
  .catch(err => {
    console.error("\n❌  Simulation error:", err.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
