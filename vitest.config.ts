import { defineConfig } from "vitest/config";

// Tests run against a local Postgres (matches the prod provider). Override via
// TEST_DATABASE_URL in CI. Default points at a disposable docker container:
//   docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/postgres";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      APP_URL: "https://rpas.test",
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: "whsec_unit",
      STRIPE_PAID_ACCESS_PRICE_ID: "price_paid_access_unit",
    },
    globalSetup: ["./vitest.globalSetup.ts"],
    // All test files share one Postgres database; run them sequentially so
    // concurrent writers don't race on shared rows. The suite is small and fast.
    fileParallelism: false,
  },
});
