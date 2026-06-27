import { PgBoss } from "pg-boss";
import { config } from "../config";
import { logger } from "../lib/logger";
import { QUEUES } from "./jobs";

let boss: PgBoss | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss(config.DATABASE_URL);

  boss.on("error", (err: unknown) => {
    logger.error({ err }, "pg-boss internal error");
  });

  await boss.start();

  // pg-boss v10: queues must be explicitly created before use.
  // policy: 'stately' enables singletonKey deduplication — without it,
  // singletonKey is silently ignored and duplicate jobs will be created.
  // Queue policy cannot be changed after creation, so we delete and recreate
  // any queue that exists with the wrong policy (safe at startup; no jobs
  // should be in flight during a fresh boss start).
  for (const name of Object.values(QUEUES)) {
    const existing = await boss!.getQueue(name).catch(() => null);
    if (existing && existing.policy !== "stately") {
      logger.warn({ queue: name, policy: existing.policy }, "queue has wrong policy, recreating");
      await boss!.deleteQueue(name).catch(() => undefined);
    }
    await boss!.createQueue(name, { policy: "stately" }).catch((err: unknown) => {
      logger.warn({ err, queue: name }, "createQueue warning (ignored)");
    });
  }

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
