import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Load .env before each test file so DATABASE_URL etc. are available.
    setupFiles: ["./src/test/setup.ts"],
    // pg-boss integration tests (boss start/stop, job round-trip) need more time.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test files sequentially so pg-boss integration tests don't race
    // against each other on the shared Postgres database.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/test/**", "src/**/*.d.ts"],
    },
  },
});
