import { PgBoss } from "pg-boss";
import { config } from "../config";
import { logger } from "../lib/logger";

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss(config.DATABASE_URL);

  boss.on("error", (err: unknown) => {
    logger.error({ err }, "pg-boss internal error");
  });

  await boss.start();
  logger.info({}, "pg-boss started");

  return boss;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  logger.info({}, "stopping pg-boss");
  await boss.stop({ graceful: true, timeout: 30_000 });
  boss = undefined;
  logger.info({}, "pg-boss stopped");
}
