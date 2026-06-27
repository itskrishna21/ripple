import { config } from "../config";
import { buildApp } from "../http/app";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";

export async function startWeb(): Promise<void> {
  const app = buildApp();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "web process started");
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    server.close(async () => {
      await pool.end();
      logger.info({}, "web process shut down");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
