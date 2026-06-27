# Ripple — Low-Level Design

Implementation-level companion to `[ARCHITECTURE.md](./ARCHITECTURE.md)`. Where the
architecture doc says *what* and *why*, this says *how*: module layout, concrete
interfaces, job payloads, transaction boundaries, error taxonomy, and the scorer.

All code blocks are **proposed** signatures and pseudocode for review, not yet
implemented. They follow existing conventions: `service/` owns data access via the
`pg` pool, `controller/` owns HTTP, domain errors are thrown as typed classes, and
validation uses Zod.

---

## 1. Module layout

New and changed files. Existing files are marked `(exists)`.

```
src/
├── index.ts                       # (exists) becomes a thin process dispatcher
├── config.ts                      # NEW: Zod-validated env, loaded once
├── process/
│   ├── web.ts                     # NEW: starts Express
│   ├── worker.ts                  # NEW: starts pg-boss consumers
│   └── scheduler.ts               # NEW: weekly enqueue + reaper sweep (§5.6)
├── http/
│   ├── app.ts                     # NEW: builds Express app (was index.ts body)
│   ├── asyncHandler.ts            # NEW: wraps async route handlers
│   ├── validate.ts                # NEW: Zod body/params/query middleware
│   ├── errorMiddleware.ts         # NEW: domain error -> HTTP mapping
│   └── pagination.ts              # NEW: cursor encode/decode helpers
├── queue/
│   ├── boss.ts                    # NEW: pg-boss singleton + lifecycle
│   ├── jobs.ts                    # NEW: queue names + payload types
│   └── publish.ts                 # NEW: typed enqueue helpers
├── pipeline/
│   ├── snapshotStart.ts           # NEW: snapshot.start handler
│   ├── fetchSource.ts             # NEW: fetch.source handler
│   ├── analyzeSnapshot.ts         # NEW: analyze.snapshot handler
│   ├── settle.ts                  # NEW: atomic "last source" transition
│   └── reaper.ts                  # NEW: stuck-snapshot sweep (§5.6)
├── ingest/
│   ├── fetcher.ts                 # NEW: SourceFetcher interface + http impl
│   ├── ssrf.ts                    # NEW: SSRF guard (§6.1)
│   ├── normalize.ts              # NEW: main-content extraction + clean
│   └── hash.ts                    # NEW: content hashing
├── diff/
│   ├── index.ts                   # NEW: diffSource() dispatcher
│   ├── pricing.ts                 # NEW: price/table diff
│   ├── entries.ts                 # NEW: changelog/blog new-entry diff
│   └── careers.ts                 # NEW: job-listing set diff
├── analysis/
│   ├── agent.ts                   # NEW: Mastra agent + Zod output schema
│   ├── categorize.ts              # NEW: changes -> signals
│   └── score.ts                   # NEW: deterministic threat scorer
├── storage/
│   └── blobStore.ts               # NEW: BlobStore interface + PG impl
├── service/                       # (exists) + new repos below
│   ├── snapshotSourceService.ts   # NEW
│   ├── signalService.ts           # NEW
│   └── analysisService.ts         # (exists) replace stub
├── lib/
│   ├── db.ts                      # (exists)
│   ├── migrate.ts                 # (exists) + advisory lock, off boot path
│   └── logger.ts                  # NEW: structured logger + correlation id
└── ...                            # (exists) firebase, auth, week, middleware
migrations/                        # 006_*, 007_*, 008_* added
```

---

## 2. Process model

`index.ts` becomes a dispatcher keyed on `PROCESS_TYPE`; each process imports shared
modules but owns its lifecycle.

```ts
// index.ts
import { config } from "./config";

async function main() {
  switch (config.PROCESS_TYPE) {
    case "web":       return (await import("./process/web")).startWeb();
    case "worker":    return (await import("./process/worker")).startWorker();
    case "scheduler": return (await import("./process/scheduler")).startScheduler();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- Migrations no longer run inside the web start path (see §10).
- Each process installs `SIGTERM`/`SIGINT` handlers for graceful shutdown:
stop accepting new work, drain in-flight, close pg-boss, `pool.end()`.

---

## 3. Config module

Single fail-fast parse of the environment. Replaces scattered `getRequiredEnv`.

```ts
// config.ts
import { z } from "zod";

const schema = z.object({
  PROCESS_TYPE: z.enum(["web", "worker", "scheduler"]).default("web"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_API_KEY: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  FETCH_TIMEOUT_MS: z.coerce.number().default(15000),
  FETCH_MAX_BYTES: z.coerce.number().default(2_000_000),
  FETCH_RETRY_LIMIT: z.coerce.number().default(5),     // must match enqueueFetchSource
  FETCH_MAX_REDIRECTS: z.coerce.number().default(3),
  WORKER_FETCH_CONCURRENCY: z.coerce.number().default(8),
  WORKER_ANALYZE_CONCURRENCY: z.coerce.number().default(2),
  REAPER_INTERVAL_MS: z.coerce.number().default(600_000),   // 10 min
  REAPER_STUCK_THRESHOLD_MIN: z.coerce.number().default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const config = schema.parse(process.env);
export type Config = z.infer<typeof schema>;
```

---

## 4. Queue layer (pg-boss)

### 4.1 Boss singleton

```ts
// queue/boss.ts
import PgBoss from "pg-boss";
import { config } from "../config";

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: config.DATABASE_URL });
  await boss.start();           // creates pgboss schema if missing
  return boss;
}

export async function stopBoss(): Promise<void> {
  await boss?.stop({ graceful: true });
  boss = undefined;
}
```

pg-boss owns its own `pgboss` schema in the same database, so there is no extra
infra and migrations of app tables stay independent.

### 4.2 Job names and payloads

```ts
// queue/jobs.ts
export const QUEUES = {
  snapshotStart: "snapshot.start",
  fetchSource: "fetch.source",
  analyzeSnapshot: "analyze.snapshot",
} as const;

export type SnapshotStartJob = { competitorId: string; weekStart: string };
export type FetchSourceJob = {
  snapshotId: string;
  competitorId: string;
  sourceKey: "pricing" | "changelog" | "careers" | "blog";
  url: string;
};
export type AnalyzeSnapshotJob = { snapshotId: string; competitorId: string };
```

### 4.3 Typed publish helpers with idempotency + retry

`singletonKey` makes enqueue idempotent; `retryLimit/Delay/Backoff` set per job
class per the [ARCHITECTURE jobs table](./ARCHITECTURE.md#jobs).

```ts
// queue/publish.ts
export async function enqueueSnapshotStart(job: SnapshotStartJob) {
  const boss = await getBoss();
  await boss.send(QUEUES.snapshotStart, job, {
    singletonKey: `${job.competitorId}:${job.weekStart}`,
    retryLimit: 3, retryDelay: 30, retryBackoff: true,
  });
}

export async function enqueueFetchSource(job: FetchSourceJob) {
  const boss = await getBoss();
  await boss.send(QUEUES.fetchSource, job, {
    singletonKey: `${job.snapshotId}:${job.sourceKey}`,
    retryLimit: 5, retryDelay: 15, retryBackoff: true,
  });
}

export async function enqueueAnalyze(job: AnalyzeSnapshotJob) {
  const boss = await getBoss();
  await boss.send(QUEUES.analyzeSnapshot, job, {
    singletonKey: job.snapshotId,
    retryLimit: 3, retryDelay: 60, retryBackoff: true,
  });
}
```

DLQ: rely on pg-boss `onComplete`/dead-letter (`deadLetter` queue option) so
exhausted jobs are retained for inspection rather than dropped.

---

## 5. Pipeline handlers

### 5.1 worker bootstrap

```ts
// process/worker.ts
export async function startWorker() {
  const boss = await getBoss();
  await boss.work(QUEUES.snapshotStart, handleSnapshotStart);
  await boss.work(QUEUES.fetchSource,
    { teamSize: config.WORKER_FETCH_CONCURRENCY }, handleFetchSource);
  await boss.work(QUEUES.analyzeSnapshot,
    { teamSize: config.WORKER_ANALYZE_CONCURRENCY }, handleAnalyzeSnapshot);
}
```

### 5.2 `snapshot.start`

```
handleSnapshotStart(job):
  competitor = getCompetitorByIdUnscoped(job.competitorId)   # worker is system context
  if not competitor: return            # deleted between enqueue and run -> drop
  snapshot = upsertSnapshot(competitor.id, job.weekStart, status='pending')
  sources = competitor URLs that are present (pricing/changelog/careers/blog)
  if sources is empty:
    setSnapshotStatus(snapshot.id, 'failed'); return
  for each (sourceKey, url) in sources:
    insertSnapshotSource(snapshot.id, sourceKey, status='pending')   # ON CONFLICT DO NOTHING
    enqueueFetchSource({ snapshotId: snapshot.id, competitorId, sourceKey, url })
```

Note: worker queries are **system-context** (no `company_id` scope) because the job
itself is the authority. Tenant scoping stays on the API read path.

### 5.3 `fetch.source`

```
handleFetchSource(job):
  fetcher = fetcherFor(job.sourceKey)
  try:
    result = fetcher.fetch(job.url)               # { raw, normalized, contentHash }
    storageKey = blobStore.put(job.snapshotId, job.sourceKey, result.raw)
    markSourceOk(job.snapshotId, job.sourceKey, {
      contentHash: result.contentHash, storageKey, normalized: result.normalized
    })
  catch err:
    if attemptsRemaining: throw err               # let pg-boss retry
    markSourceFailed(job.snapshotId, job.sourceKey, String(err))
  settleSnapshotIfComplete(job.snapshotId, job.competitorId)   # §5.5
```

### 5.4 `analyze.snapshot`

```
handleAnalyzeSnapshot(job):
  current  = getSnapshotWithSources(job.snapshotId)
  previous = getPreviousSnapshot(current.competitorId, current.weekStart)
  setSnapshotStatus(current.id, 'analyzing')

  # Cold start: first-ever snapshot has no baseline to diff against. §8.4
  if previous is null:
    writeAnalysis(current.id, null, score=0, breakdown={},
                  summary="Baseline snapshot", isBaseline=true)
    setSnapshotStatus(current.id, 'analyzed'); return

  candidates = []
  for sourceKey in current.okSources:
    cur = current.normalized[sourceKey]
    prev = previous.normalized[sourceKey]
    if prev is null:
      continue                                    # source new this week -> baseline, no diff. §8.4
    if current.hash[sourceKey] == previous.hash[sourceKey]:
      continue                                    # unchanged -> skip (cost lever)
    candidates += diffSource(sourceKey, prev, cur)

  if candidates is empty:
    writeAnalysis(current.id, previous.id, score=0, breakdown={}, summary="No changes")
    setSnapshotStatus(current.id, 'analyzed'); return

  out = await categorize(candidates)              # AnalysisOutput { signals[], summary }
  TX:
    insertSignals(current.id, out.signals)        # persist first...
    signals = getSignals(current.id)              # ...then score the STORED rows
    { score, breakdown } = scoreSignals(signals)  # deterministic, pure
    upsertAnalysis(current.id, previous.id, score, breakdown, out.summary,
                   model, promptVersion, POLICY_VERSION)
    setSnapshotStatus(current.id, 'analyzed')
```

### 5.5 Atomic settle (the critical concurrency point)

Four `fetch.source` jobs run concurrently and all call settle. Exactly one must
enqueue analysis. Do it in one transaction with a row lock on the parent snapshot.

```sql
-- settle.ts (inside a transaction)
SELECT id FROM competitor_snapshots WHERE id = $1 FOR UPDATE;

SELECT
  count(*) FILTER (WHERE status = 'pending') AS pending,
  count(*) FILTER (WHERE status = 'ok')      AS ok,
  count(*) FILTER (WHERE status = 'failed')  AS failed
FROM snapshot_sources WHERE snapshot_id = $1;
```

```
if pending > 0: COMMIT; return            # not done yet
status = ok>0 && failed==0 ? 'completed'
       : ok>0              ? 'partial'
       :                     'failed'
UPDATE competitor_snapshots SET status=status WHERE id=$1 AND status IN ('pending','fetching')
  RETURNING id                             # returns 0 rows if another worker already settled
COMMIT
if updated 1 row and status != 'failed':
  enqueueAnalyze({ snapshotId, competitorId })   # singletonKey also guards double-send
```

The `FOR UPDATE` lock plus the guarded `UPDATE ... status IN (...)` makes the
transition fire once even under concurrent settles; the analyze `singletonKey` is a
second line of defense.

### 5.6 Terminal failure & reaper

A source stuck on `pending` freezes settle forever (`pending > 0` never clears).
This is the single most dangerous failure mode, so liveness is enforced two ways.

**(a) Mark `failed` on the final attempt — don't trust the queue to tell us.**
pg-boss exposes the retry count on the job; the handler decides terminality itself:

```ts
// pipeline/fetchSource.ts
async function handleFetchSource(job) {
  const isFinalAttempt = job.retrycount >= FETCH_RETRY_LIMIT; // pg-boss-provided
  try {
    const result = await fetcherFor(job.data.sourceKey).fetch(job.data.url);
    const storageKey = await blobStore.put(job.data.snapshotId, job.data.sourceKey, result.raw);
    await markSourceOk(job.data.snapshotId, job.data.sourceKey, { ...result, storageKey });
  } catch (err) {
    if (isFinalAttempt) {
      await markSourceFailed(job.data.snapshotId, job.data.sourceKey, String(err)); // terminal
    } else {
      throw err; // let pg-boss retry
    }
  } finally {
    await settleSnapshotIfComplete(job.data.snapshotId, job.data.competitorId);
  }
}
```

The `finally` runs settle on both the terminal-failure and success paths, so the
snapshot advances as soon as the last source resolves either way.

**(b) Reaper as the backstop** (for crashes mid-handler, lost jobs, or a process
killed before `markSourceFailed` commits). A scheduled job (every ~10 min):

```sql
-- snapshots stuck in an in-flight state past a timeout
SELECT id, competitor_id FROM competitor_snapshots
WHERE status IN ('pending', 'fetching', 'analyzing')
  AND updated_at < NOW() - INTERVAL '30 minutes'
FOR UPDATE SKIP LOCKED;
```

```
for each stuck snapshot:
  if status in ('pending','fetching'):
    UPDATE snapshot_sources SET status='failed', error='reaped: timeout'
      WHERE snapshot_id=$1 AND status='pending'
    settleSnapshotIfComplete(snapshot.id, competitor.id)   # -> partial or failed
  if status == 'analyzing':                                # analyze crashed
    re-enqueue analyze.snapshot (singletonKey guards dupes)
  emit metric stuck_snapshot_reaped{from_status}
```

- `SKIP LOCKED` lets the reaper run safely alongside live workers.
- Timeouts (`FETCH_RETRY_LIMIT`, reap interval, 30-min threshold) are config values.
- The reaper is idempotent: a snapshot that settled normally just won't match.

---

## 6. Ingestion

```ts
// ingest/fetcher.ts
export type FetchResult = { raw: string; normalized: string; contentHash: string };

export interface SourceFetcher {
  key: TrackedSourceKey;
  fetch(url: string): Promise<FetchResult>;
}

export class HttpFetcher implements SourceFetcher {
  constructor(public key: TrackedSourceKey) {}
  async fetch(url: string): Promise<FetchResult> {
    const safe = await assertUrlSafe(url);  // §6.1 SSRF guard — throws if blocked
    const res = await fetchPinned(safe, config.FETCH_TIMEOUT_MS); // connect to validated IP
    assertOk(res);                          // status, content-type, size <= FETCH_MAX_BYTES
    const raw = await readCapped(res, config.FETCH_MAX_BYTES);
    const normalized = normalize(raw, url); // main content + clean
    return { raw, normalized, contentHash: sha256(normalized) };
  }
}
```

- `normalize()` (ingest/normalize.ts): extract main content (Readability-style),
  strip nav/footer/script/style, collapse whitespace. Hash is taken over
  **normalized** text so cosmetic markup changes don't create false diffs.
- `hash.ts`: `sha256(normalized)` hex.
- Politeness: a per-domain token bucket keyed by hostname guards request rate;
  realistic UA header; optional `robots.txt` check (politeness only, not security).

### 6.1 SSRF guard

A blocking pre-fetch control (`ingest/ssrf.ts`). URLs are tenant-supplied and
fetched from inside our network, so this ships *with* the fetcher, not later.

```ts
// ingest/ssrf.ts
const BLOCKED_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
];
const BLOCKED_V6 = ["::1/128", "fc00::/7", "fe80::/10", "::ffff:0:0/96"];

export async function assertUrlSafe(raw: string): Promise<ResolvedTarget> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new BlockedUrlError("scheme");
  const ips = await dns.lookup(url.hostname, { all: true });   // resolve first
  if (ips.length === 0) throw new BlockedUrlError("no-dns");
  for (const { address } of ips)                               // ALL must be public
    if (isBlocked(address, BLOCKED_V4, BLOCKED_V6))
      throw new BlockedUrlError("private-ip");
  return { url, ip: ips[0].address };                          // pin to this IP
}
```

- **DNS-resolve-then-check**, and reject if *any* resolved address is private/reserved.
- **`fetchPinned` connects to the validated IP** (rebinding defense); it re-runs
  `assertUrlSafe` on every redirect `Location` and caps redirects (`FETCH_MAX_REDIRECTS`).
- Run `assertUrlSafe` **twice**: at competitor create/update (fast user feedback) and
  again at fetch time (DNS can change in between). The create/update call surfaces a
  `BlockedUrlError → 400` via the error middleware.
- A `BlockedUrlError` at fetch time marks the source `failed` with reason `blocked_url`
  (terminal, no retry — it won't get safer on retry).

```ts
// storage/blobStore.ts
export interface BlobStore {
  put(snapshotId: string, sourceKey: string, raw: string): Promise<string>; // returns storageKey
  get(storageKey: string): Promise<string>;
}
// PgBlobStore: stores raw in a snapshot_blobs table; S3BlobStore added later, same interface.
```

---

## 7. Diff engine

```ts
// diff/index.ts
export type ChangeType = "added" | "removed" | "modified";

export type Candidate = {
  sourceKey: TrackedSourceKey;
  changeType: ChangeType;
  before?: string;
  after?: string;
  meta?: Record<string, unknown>;
};

export function diffSource(
  sourceKey: TrackedSourceKey,
  previous: string | undefined,
  current: string,
): Candidate[];
```

- **pricing.ts** — parse price/plan rows, emit per-plan added/removed/modified with
numeric deltas in `meta`.
- **entries.ts** (changelog/blog) — segment into entries (by heading/date), emit
entries present in `current` but not `previous` as `added`.
- **careers.ts** — set diff on job titles/locations; opened vs closed roles.
- First commit can use a line/block diff fallback; per-source parsers harden over
time. Diff is fully deterministic — no LLM.

---

## 8. Analysis & scoring

### 8.1 Mastra categorization (the only LLM step)

```ts
// analysis/agent.ts
export const SignalSchema = z.object({
  sourceKey: z.enum(["pricing", "changelog", "careers", "blog"]),
  category: z.enum([
    "pricing_change", "new_feature", "deprecation",
    "hiring", "funding_or_news", "messaging_change", "other",
  ]),
  changeType: z.enum(["added", "removed", "modified"]),
  severity: z.number().int().min(1).max(5),
  payload: z.record(z.unknown()),
});

export const AnalysisOutputSchema = z.object({
  signals: z.array(SignalSchema),
  summary: z.string().min(1),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
```

```ts
// analysis/categorize.ts

// Bump when the prompt OR model changes — it starts a new categorization lineage.
export const PROMPT_VERSION = "v1";

export async function categorize(candidates: Candidate[]): Promise<AnalysisOutput> {
  const out = await mastraAgent.generate({ candidates }, {
    output: AnalysisOutputSchema,         // structured output, schema-enforced
    temperature: 0.1,
  });
  return AnalysisOutputSchema.parse(out); // repair/reject on invalid
}
```

The LLM only **labels** changes (category + severity). It never returns the score.

**Provenance.** Each analysis stores `model`, `prompt_version`, and `policy_version`.
`model`/`prompt_version` identify the *categorization* lineage (re-running the LLM may
yield different signals); `policy_version` identifies the *scoring* lineage (pure
function over stored signals). Two analyses are only comparable when all three match.

### 8.4 Cold start (week 1 / new source)

Without this, the first snapshot has no baseline so every source diffs as 100%
"added", producing max-noise signals and an inflated first score for *every*
competitor. Rules:

- **First snapshot for a competitor** (`getPreviousSnapshot` returns null): write a
  **baseline** analysis — `is_baseline = true`, `score = 0`, no signals, no LLM call.
  The baseline's normalized content becomes next week's comparison point.
- **A source that is new this week** (present now, absent in the previous snapshot):
  skip its diff and record it as baseline for that source only; the rest of the
  snapshot still diffs normally.
- `analyses.is_baseline BOOLEAN NOT NULL DEFAULT false` is added in migration `008`.
- Read endpoints treat a baseline analysis as "tracking started — no changes yet,"
  not as a real `0` threat.

### 8.2 Deterministic scorer

The scorer is a pure function of the **persisted signals** — not of the LLM call.
Given the same `signals` rows it always returns the same number, which is what
"deterministic/auditable" means here (the LLM categorization upstream is *not*
deterministic; see [ARCHITECTURE → What "deterministic" means](./ARCHITECTURE.md#what-deterministic-means-here)).

```ts
// analysis/score.ts

// Scoring policy v1. Bump POLICY_VERSION when any constant below changes.
export const POLICY_VERSION = "v1";

const CATEGORY_WEIGHT: Record<string, number> = {
  pricing_change: 1.0,
  new_feature: 0.8,
  funding_or_news: 0.7,
  deprecation: 0.6,
  hiring: 0.4,
  messaging_change: 0.3,
  other: 0.2,
};

// raw value that maps to a "100" week. Derived in §8.3.
const SCALE = 3.0;

export type Signal = {
  category: keyof typeof CATEGORY_WEIGHT | string;
  severity: number; // 1..5
};

export function scoreSignals(signals: Signal[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let raw = 0;
  for (const s of signals) {
    const contribution = (CATEGORY_WEIGHT[s.category] ?? 0.2) * (s.severity / 5);
    breakdown[s.category] = round2((breakdown[s.category] ?? 0) + contribution);
    raw += contribution;
  }
  const score = Math.round(Math.min(1, raw / SCALE) * 100); // 0..100
  return { score, breakdown };
}
```

- Input is `Signal[]` loaded from the DB (or freshly categorized), **not** the raw
  `AnalysisOutput` — this is what makes re-scoring stored history reproducible.
- One formula, matching ARCHITECTURE exactly: `raw = Σ weight × (severity/5)`,
  `score = round(min(1, raw/SCALE) × 100)`.
- **No `recency_decay`** in v1 (single week vs. previous → always 1). Deferred.

### 8.3 Worked scoring example

One concrete competitor-week, end to end, so the arithmetic is unambiguous.

**Scenario — "Acme", week of 2026-06-22.** Diff vs. previous week yields three
candidate changes; the LLM categorizes them into these signals:

| # | source | category | change | severity | weight | contribution = weight × (sev/5) |
| - | ------ | -------- | ------ | -------- | ------ | -------------------------------- |
| 1 | pricing | `pricing_change` | modified | 5 | 1.0 | 1.0 × 1.0 = **1.00** |
| 2 | changelog | `new_feature` | added | 3 | 0.8 | 0.8 × 0.6 = **0.48** |
| 3 | careers | `hiring` | added | 2 | 0.4 | 0.4 × 0.4 = **0.16** |

```
raw   = 1.00 + 0.48 + 0.16 = 1.64
score = round( min(1, 1.64 / 3.0) × 100 )
      = round( min(1, 0.5467) × 100 )
      = round( 54.67 )
      = 55
breakdown = { pricing_change: 1.00, new_feature: 0.48, hiring: 0.16 }
```

**Result:** `threat_score = 55`, dominated by the pricing change (the surfaced
headline is the pricing move, not the "55").

**Why `SCALE = 3.0`:** a "100" week should require roughly the equivalent of one
maximum-severity pricing change *plus* two more strong, high-severity signals
(`1.0 + ~1.0 + ~1.0 ≈ 3.0`). A single max pricing change alone yields
`round(1/3 × 100) = 33` — present and notable, not an alarm. `SCALE` is fixed per
`POLICY_VERSION`; tune it against real weeks once data exists and bump the version.

---

## 9. Data access & migrations

New repos mirror existing style (typed `Row` + `rowToX` mappers, parameterized SQL):

- `snapshotSourceService.ts` — `insertSource`, `markSourceOk`, `markSourceFailed`,
`getSourcesForSnapshot`, `countSourceStatuses` (used by settle).
- `signalService.ts` — `insertSignals(snapshotId, signals[])` (bulk insert).
- `analysisService.ts` — replace stub with `upsertAnalysis`, `getAnalysisForSnapshot`,
`getLatestAnalysisForCompetitor`, and the tenant-scoped read used by controllers.

Migrations `006_snapshot_sources.sql`, `007_signals.sql`, `008_analyses.sql` as
specified in [ARCHITECTURE → Data model](./ARCHITECTURE.md#data-model). Add
`009_snapshot_blobs.sql` if using `PgBlobStore` initially.

#### 9.1 JSONB `sources` → `snapshot_sources` data migration

`competitor_snapshots.sources` (JSONB) is the current authority for per-source state;
`006` introduces the `snapshot_sources` table that supersedes it. The riskiest hidden
work is moving existing rows. Plan:

1. **006a (schema):** create `snapshot_sources` (nullable `content_hash`/`storage_key`
   since historical raw payloads were never stored).
2. **006b (backfill):** expand each existing JSONB blob into rows, idempotently:

```sql
INSERT INTO snapshot_sources (snapshot_id, source_key, status)
SELECT s.id, kv.key,
       CASE kv.value->>'status'
         WHEN 'ok' THEN 'ok' WHEN 'failed' THEN 'failed' ELSE 'pending' END
FROM competitor_snapshots s
CROSS JOIN LATERAL jsonb_each(s.sources) AS kv(key, value)
WHERE kv.key IN ('pricing','changelog','careers','blog')
ON CONFLICT (snapshot_id, source_key) DO NOTHING;
```

3. **Dual-read transition:** the snapshot service reads from `snapshot_sources` and
   stops writing the JSONB column (kept temporarily for rollback).
4. **006c (cleanup, later migration):** drop `competitor_snapshots.sources` once the
   table is proven in production.

Backfilled rows have no `content_hash`, so the first post-migration run diffs against
no baseline for those sources — handled by the cold-start "new source" rule (§8.4),
not by inflating scores.

Transaction boundaries:

- signup (exists) — company + user in one TX.
- analyze — signals + analysis + status in one TX (§5.4).
- settle — count + transition in one TX with `FOR UPDATE` (§5.5).

---

## 10. Migrations off the boot path

```ts
// migrate.ts: wrap runMigrations in an advisory lock
await pool.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
try { await runMigrations(); }
finally { await pool.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]); }
```

- Invoked by `npm run migrate` as a **deploy/release step**, not from `web` start.
- Advisory lock makes concurrent runners safe (one applies, others wait then no-op).

---

## 11. API layer

### 11.1 asyncHandler + error middleware

```ts
// http/asyncHandler.ts
export const asyncHandler =
  (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

```ts
// http/errorMiddleware.ts — single mapping point
const STATUS = new Map<Function, number>([
  [CompetitorNotFoundError, 404],
  [SnapshotNotFoundError, 404],
  [UserExistsError, 409],
  [ValidationError, 400],
  [BlockedUrlError, 400],
  [UnauthorizedError, 401],
]);

export function errorMiddleware(err, req, res, _next) {
  const status = [...STATUS].find(([cls]) => err instanceof cls)?.[1] ?? 500;
  if (status === 500) logger.error({ err, reqId: req.id }, "unhandled");
  res.status(status).json({ error: status === 500 ? "Internal error" : err.message });
}
```

This lets controllers drop their repetitive `try/catch` + `safeParse` blocks; they
throw domain errors and the middleware maps them.

### 11.2 validate middleware

```ts
// http/validate.ts
export const validate = (schema, where: "body" | "params" | "query" = "body") =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[where]);
    if (!parsed.success) return next(new ValidationError(parsed.error.flatten()));
    req[where] = parsed.data;
    next();
  };

// usage: app.post("/competitors", requireAuth, validate(createCompetitorSchema), createCompetitor)
```

### 11.3 Pagination

Cursor = base64 of `{ createdAt, id }`; list queries become
`WHERE company_id=$1 AND (created_at, id) < ($cursor) ORDER BY created_at DESC, id DESC LIMIT $n`.
Response: `{ data: [...], nextCursor: string | null }`.

### 11.4 New read endpoints (pipeline outputs)


| Method | Path                                 | Description                                    |
| ------ | ------------------------------------ | ---------------------------------------------- |
| `GET`  | `/competitors/:id/snapshots`         | snapshots for a competitor (paginated)         |
| `GET`  | `/competitors/:id/analysis`          | latest analysis (replaces stub)                |
| `GET`  | `/analysis`                          | latest analysis per competitor for the company |
| `POST` | `/competitors/:id/snapshots:refresh` | (optional) on-demand enqueue                   |

**Tenant scoping is mandatory on every new read.** Workers run in system context
(§5.2), but these API paths must enforce `company_id` with the same rigor as existing
routes. Because `signals`/`analyses` carry no `company_id` column, every query joins
back to the tenant boundary and filters on the authenticated company — never by
`snapshot_id`/`competitor_id` alone:

```sql
SELECT a.*
FROM analyses a
JOIN competitor_snapshots cs ON cs.id = a.snapshot_id
JOIN competitors c          ON c.id = cs.competitor_id
WHERE c.id = $1 AND c.company_id = $2;   -- $2 = req.user.companyId, always
```

The `:id`-scoped routes additionally call `getCompetitorById(id, companyId)` first
(returns 404 on cross-tenant access, as the existing analysis controller already does).
An integration test asserts company A cannot read company B's signals/analyses.


---

## 12. Error & retry semantics


| Failure                     | Where        | Behavior                                               |
| --------------------------- | ------------ | ------------------------------------------------------ |
| Invalid request body        | API          | `ValidationError` → 400, no retry                      |
| Unknown competitor (scoped) | API          | `CompetitorNotFoundError` → 404                        |
| Blocked/SSRF URL            | create/update API | `BlockedUrlError` → 400                            |
| Blocked/SSRF URL            | fetch.source | mark source `failed` (`blocked_url`), terminal, no retry |
| HTTP fetch timeout / 5xx    | fetch.source | throw → pg-boss retry (5x backoff)                     |
| HTTP 4xx / bad content      | fetch.source | on final attempt mark source `failed` → snapshot `partial` (§5.6) |
| Source stuck `pending`      | reaper       | mark `failed`, force settle, alert (§5.6)              |
| analyze crashed (`analyzing`) | reaper     | re-enqueue analyze (singletonKey-guarded) (§5.6)      |
| Cold start (no previous)    | analyze      | write baseline analysis, no LLM (§8.4)                |
| LLM invalid output          | analyze      | repair once, else throw → retry, then DLQ             |
| LLM provider error          | analyze      | throw → retry (3x), then DLQ                           |
| Settle race                 | settle       | guarded UPDATE; only one worker enqueues analyze       |
| Job re-delivery             | all          | idempotent via `singletonKey` + DB upserts             |


---

## 13. Observability

- `lib/logger.ts`: structured JSON (pino-style) with `reqId` (API) / `jobId`
(worker) correlation fields bound per request/job.
- Counters/timers: queue depth (pg-boss `getQueueSize`), fetch success rate, LLM
latency + token cost, snapshot completion rate, analyze duration.
- `GET /health` (process up) and `GET /ready` (DB reachable, boss started).

---

## 14. Testing


| Layer       | What                                                                   | Tooling               |
| ----------- | ---------------------------------------------------------------------- | --------------------- |
| Unit        | `score.ts`, `diff/*`, `normalize`, `getWeekStart`, settle status logic | vitest/jest           |
| Integration | repos + settle TX + pg-boss flow against real PG                       | testcontainers        |
| Contract    | Mastra output conforms to `AnalysisOutputSchema`                       | recorded fixtures     |
| E2E         | seeded competitor → fake HTTP fixtures → pipeline → assert analysis    | testcontainers + nock |


Determinism: stub the fetcher with fixture HTML and the LLM with canned categorized
output so pipeline tests are reproducible and free. Add explicit cases for the
council-flagged paths: cold start (§8.4), SSRF block (§6.1), stuck-`pending` reaper
(§5.6), the worked scoring example (§8.3) as a golden test, and a cross-tenant read
denial.

---

## 15. Suggested PR sequence

1. **Foundations** — `config.ts`, `asyncHandler`, `validate`, `errorMiddleware`
   (incl. `BlockedUrlError`), pagination, logger, dependency cleanup (`expresss`),
   migrations off boot + advisory lock. Refactor existing controllers onto middleware.
2. **Queue + process split** — `index.ts` dispatcher, `process/*`, `queue/*`,
   pg-boss dependency, graceful shutdown.
3. **Ingestion** — `006` (+ §9.1 backfill, dual-read) and `009` migrations,
   `snapshotSourceService`, `ingest/*` incl. **`ssrf.ts`**, `storage/blobStore`,
   `snapshot.start` + `fetch.source` handlers, settle + **terminal-failure path (§5.6)**.
4. **Intelligence** — `007` + `008` migrations (incl. `is_baseline`,
   `prompt_version`, `policy_version`), `diff/*`, `analysis/*`, `signalService`,
   replace `analysisService` stub, `analyze.snapshot` handler with **cold-start (§8.4)**,
   scoring from stored signals (§8.2), tenant-scoped read endpoints.
5. **Scheduler + ops** — `process/scheduler.ts` weekly enqueue **and the reaper
   (§5.6)**, DLQ tooling, metrics + health endpoints, stuck-snapshot alert.
6. **Cleanup (later)** — drop `competitor_snapshots.sources` once `snapshot_sources`
   is proven in production (§9.1 step 4).

