import { Pool } from "pg";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export const pool = new Pool({
  connectionString: getRequiredEnv("DATABASE_URL"),
});

export async function closePool(): Promise<void> {
  await pool.end();
}
