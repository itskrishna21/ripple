/**
 * DLQ Inspector — shows failed pg-boss jobs for operator review.
 *
 * Usage:
 *   npx tsx scripts/dlq-inspect.ts            # show all failed jobs
 *   npx tsx scripts/dlq-inspect.ts --queue snapshot.start
 *   npx tsx scripts/dlq-inspect.ts --limit 20
 *   npx tsx scripts/dlq-inspect.ts --retry <jobId>
 *   npx tsx scripts/dlq-inspect.ts --purge    # delete all failed jobs
 *
 * "Failed" in pg-boss means the job exhausted all retries (retryCount >= retryLimit).
 * These are the dead-letter jobs — safe to inspect and optionally replay.
 */

import "dotenv/config";
import { pool } from "../src/lib/db";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const argValue = (f: string) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : undefined;
};

type FailedJob = {
  id: string;
  name: string;
  data: unknown;
  retry_count: number;
  retry_limit: number;
  output: unknown;
  createdon: Date;
  completedon: Date | null;
};

const sep = () => console.log("─".repeat(72));

async function main() {
  const queue = argValue("--queue");
  const limit = Number(argValue("--limit") ?? "50");
  const retryId = argValue("--retry");
  const purge = flag("--purge");

  // ── Retry a single job ──────────────────────────────────────────────────
  if (retryId) {
    const result = await pool.query(
      `UPDATE pgboss.job
       SET state       = 'retry',
           retryon     = NOW(),
           retrycount  = retrycount - 1,
           completedon = NULL,
           output      = NULL
       WHERE id = $1 AND state = 'failed'
       RETURNING id, name`,
      [retryId],
    );
    if (result.rows.length === 0) {
      console.error(`No failed job found with id=${retryId}`);
    } else {
      console.log(`✓ Job re-queued: ${JSON.stringify(result.rows[0])}`);
    }
    return;
  }

  // ── Purge all failed jobs ───────────────────────────────────────────────
  if (purge) {
    const result = await pool.query(
      `DELETE FROM pgboss.job WHERE state = 'failed'${queue ? ` AND name = $1` : ""}`,
      queue ? [queue] : [],
    );
    console.log(`✓ Deleted ${result.rowCount} failed job(s)${queue ? ` from queue "${queue}"` : ""}.`);
    return;
  }

  // ── List failed jobs ────────────────────────────────────────────────────
  const result = await pool.query<FailedJob>(
    `SELECT id, name, data, retrycount AS retry_count, retrylimit AS retry_limit,
            output, createdon, completedon
     FROM pgboss.job
     WHERE state = 'failed'
     ${queue ? "AND name = $1" : ""}
     ORDER BY createdon DESC
     LIMIT ${limit}`,
    queue ? [queue] : [],
  );

  sep();
  console.log(`  DLQ Inspector — Failed Jobs${queue ? ` (queue: ${queue})` : ""}`);
  console.log(`  ${result.rows.length} result(s) (limit ${limit})`);
  sep();

  if (result.rows.length === 0) {
    console.log("  ✓ No failed jobs — DLQ is clean.\n");
    return;
  }

  for (const job of result.rows) {
    console.log(`\n  ID:       ${job.id}`);
    console.log(`  Queue:    ${job.name}`);
    console.log(`  Created:  ${new Date(job.createdon).toISOString()}`);
    console.log(`  Retries:  ${job.retry_count} / ${job.retry_limit}`);
    console.log(`  Payload:  ${JSON.stringify(job.data)}`);
    if (job.output) {
      const out = job.output as Record<string, unknown>;
      const msg = (out["message"] ?? out["error"] ?? JSON.stringify(out)) as string;
      console.log(`  Error:    ${String(msg).slice(0, 200)}`);
    }
  }

  sep();
  console.log("\n  Actions:");
  console.log("    npx tsx scripts/dlq-inspect.ts --retry <id>   # re-queue a specific job");
  console.log("    npx tsx scripts/dlq-inspect.ts --purge        # delete all failed jobs\n");
}

main()
  .catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => pool.end());
