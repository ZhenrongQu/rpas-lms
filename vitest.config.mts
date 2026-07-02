import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against a local Postgres (matches the prod provider). Override via
// TEST_DATABASE_URL in CI. Default points at a disposable docker container:
//   docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/postgres";

// The remediation kernel's advisory-lock test runs against a DEDICATED database
// (never the shared one it might force-reset). Default it next to the test DB and
// inject it, so a clean `pnpm test` is self-contained; globalSetup provisions it.
function remediationUrlFrom(base: string): string {
  const u = new URL(base);
  u.pathname = "/rpas_remediation_test";
  return u.toString();
}
const REMEDIATION_TEST_DATABASE_URL =
  process.env.REMEDIATION_TEST_DATABASE_URL ?? remediationUrlFrom(TEST_DATABASE_URL);

export default defineConfig({
  resolve: {
    // Mirror tsconfig "@/*" → "./src/*" so tests can import route modules that
    // use the "@/" alias (e.g. coriander video routes).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      REMEDIATION_TEST_DATABASE_URL,
      // SEC-05: opt-in flag that, together with NODE_ENV=test, enables the
      // x-test-user-id auth header in sessionAuth.ts. Never set in production.
      ALLOW_TEST_AUTH: "1",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      APP_URL: "https://rpas.test",
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: "whsec_unit",
      STRIPE_ADVANCED_BUNDLE_PRICE_ID: "price_advanced_bundle_unit",
      STRIPE_FLIGHT_REVIEW_PRICE_ID: "price_flight_review_unit",
    },
    globalSetup: ["./vitest.globalSetup.ts"],
    // All test files share one Postgres database; run them sequentially so
    // concurrent writers don't race on shared rows. The suite is small and fast.
    fileParallelism: false,
  },
});
