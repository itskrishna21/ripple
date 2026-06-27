import { config } from "./config"; // fail fast on bad env before anything else
import { buildApp } from "./http/app";
import { logger } from "./lib/logger";
import { pool } from "./lib/db";

async function startWeb(): Promise<void> {
  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "server started");
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown signal received");
    server.close(async () => {
      await pool.end();
      logger.info({}, "server closed");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

startWeb().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
