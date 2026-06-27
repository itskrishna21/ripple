// Load test env first (.env.test overrides .env) before config.ts is evaluated.
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

dotenvConfig({ path: resolve(process.cwd(), ".env.test"), override: true });
