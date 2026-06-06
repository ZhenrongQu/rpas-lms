import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
    },
    globalSetup: ["./vitest.globalSetup.ts"],
    // All test files share one SQLite file; run them sequentially so concurrent
    // writers don't hit SQLITE_BUSY locks. The suite is small and fast.
    fileParallelism: false,
  },
});
