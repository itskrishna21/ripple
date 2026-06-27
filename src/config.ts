import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PROCESS_TYPE: z.enum(["web", "worker", "scheduler"]).default("web"),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_API_KEY: z.string().min(1),

  // Worker / ingestion
  FETCH_TIMEOUT_MS: z.coerce.number().default(15_000),
  FETCH_MAX_BYTES: z.coerce.number().default(2_000_000),
  FETCH_RETRY_LIMIT: z.coerce.number().default(5),
  FETCH_MAX_REDIRECTS: z.coerce.number().default(3),
  WORKER_FETCH_CONCURRENCY: z.coerce.number().default(8),
  WORKER_ANALYZE_CONCURRENCY: z.coerce.number().default(2),

  // Reaper
  REAPER_INTERVAL_MS: z.coerce.number().default(600_000),
  REAPER_STUCK_THRESHOLD_MIN: z.coerce.number().default(30),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function parseConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${missing}`);
  }
  return result.data;
}

export const config = parseConfig();
export type Config = z.infer<typeof schema>;
