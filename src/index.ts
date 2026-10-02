import "./instrument.js"; // Sentry first — before other app imports
import { config } from "./config"; // validates env — fails fast before anything else
import { logger } from "./lib/logger";
import { Sentry } from "./instrument.js";

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
    case "all": {
      const { startAll } = await import("./process/all.js");
      return startAll();
    }
  }
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  Sentry.captureException(err);
  process.exit(1);
});
