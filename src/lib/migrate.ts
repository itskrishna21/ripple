import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PoolClient } from "pg";
import { pool } from "./db";
import { logger } from "./logger";

// Arbitrary stable integer used as the Postgres advisory lock key so that only
// one process applies migrations at a time (safe for multi-replica deploys).
const MIGRATION_LOCK_ID = 5_432_000;

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM schema_migrations",
  );
  return new Set(result.rows.map((r) => r.id));
}

async function applyMigration(
  client: PoolClient,
  id: string,
  sql: string,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    await client.query("COMMIT");
    logger.info({ migration: id }, "migration applied");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationsTable(client);

    const migrationsDir = join(process.cwd(), "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await applyMigration(client, file, sql);
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
      .catch(() => undefined);
    client.release();
  }
}

// Allow running directly as a deploy step: `npm run migrate`
if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      logger.info({}, "migrations complete");
    })
    .catch(async (error) => {
      logger.error({ err: error }, "migrations failed");
      await pool.end();
      process.exit(1);
    });
}
