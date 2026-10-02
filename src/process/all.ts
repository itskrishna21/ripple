import { config } from "../config";
import { buildApp } from "../http/app";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { stopBoss } from "../queue/boss";
import { startSchedulerLoops } from "./scheduler";
import { registerWorkerJobs } from "./worker";

/**
 * Free Render only allows web services. Run API + queue consumers +
 * weekly enqueue in one process so snapshots still process.
 */
export async function startAll(): Promise<void> {
  await registerWorkerJobs();
  const stopLoops = await startSchedulerLoops();

  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "combined web+worker+scheduler started");
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    stopLoops();
    server.close(async () => {
      await stopBoss();
      await pool.end();
      logger.info({}, "combined process shut down");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
