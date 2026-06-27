import { config } from "./config"; // validates env — fails fast before anything else
import { logger } from "./lib/logger";

async function main(): Promise<void> {
  switch (config.PROCESS_TYPE) {
    case "web": {
      const { startWeb } = await import("./process/web.js");
      return startWeb();
    }
    case "worker": {
      const { startWorker } = await import("./process/worker.js");
      return startWorker();
    }
    case "scheduler": {
      const { startScheduler } = await import("./process/scheduler.js");
      return startScheduler();
    }
  }
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
