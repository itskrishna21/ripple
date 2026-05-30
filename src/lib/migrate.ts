import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./db";

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasMigration(id: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [id],
  );

  return result.rowCount === 1;
}

async function applyMigration(id: string, sql: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (await hasMigration(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await applyMigration(file, sql);
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      console.log("Migrations complete");
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
