import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      APP_URL: "https://rpas.test",
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: "whsec_unit",
      STRIPE_PAID_ACCESS_PRICE_ID: "price_paid_access_unit",
    },
    globalSetup: ["./vitest.globalSetup.ts"],
    // All test files share one SQLite file; run them sequentially so concurrent
    // writers don't hit SQLITE_BUSY locks. The suite is small and fast.
    fileParallelism: false,
  },
});
