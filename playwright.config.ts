import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, webServerEnv } from "./e2e/env";

/**
 * Smoke coverage for the one journey this release rewrote end to end: book a
 * Flight Review, cancel it, get the credit back (PRD N15).
 *
 * Kept out of `pnpm test`: vitest resets its database between runs and these
 * need a live server, so they are a separate command (`pnpm e2e`) against a
 * separate database and port.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/globalSetup.ts",
  // The journey mutates one student's single credit; parallel workers would
  // race for it and the failure would read as a product bug.
  workers: 1,
  fullyParallel: false,
  // A flaky booking test is a booking bug. Retrying would hide exactly what
  // this suite exists to find.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: webServerEnv(),
  },
});
