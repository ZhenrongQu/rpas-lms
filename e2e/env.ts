import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The E2E stack runs against its own database, its own port, and no live
 * credentials.
 *
 * Deliberately NOT the vitest database: `vitest.globalSetup` truncates and
 * re-pushes the schema, so a suite running next to this one would delete its
 * fixtures mid-journey. Deliberately not `.env` either — that points at
 * production.
 */
const DEFAULT_BASE = "postgresql://postgres:postgres@localhost:5433/postgres";

/** Same server as the vitest database, a different database on it. */
export function e2eDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL ?? DEFAULT_BASE;
  const url = new URL(base);
  url.pathname = "/rpas_e2e";
  return url.toString();
}

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3111);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** What the E2E server is given on purpose. Everything else in .env is blanked. */
function e2eOverrides(): Record<string, string> {
  const db = e2eDatabaseUrl();
  return {
    DATABASE_URL: db,
    DIRECT_URL: db,
    APP_URL: E2E_BASE_URL,
    AUTH_URL: E2E_BASE_URL,
    AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-000",
    // Payments are not exercised here, but the module reads these when loaded.
    STRIPE_SECRET_KEY: "sk_test_e2e",
    STRIPE_WEBHOOK_SECRET: "whsec_e2e",
    STRIPE_ADVANCED_BUNDLE_PRICE_ID: "price_advanced_bundle_e2e",
    STRIPE_FLIGHT_REVIEW_PRICE_ID: "price_flight_review_e2e",
  };
}

/**
 * A value that is obviously not a credential, but is not empty.
 *
 * Empty string does NOT work: `@next/env` treats `''` the same as unset and
 * overwrites it from `.env`, so a key blanked that way comes back live.
 */
const DISABLED = "e2e-disabled";

/**
 * Env for the Next server under test: the overrides above, plus a disabled
 * sentinel for every other key `.env` defines.
 *
 * `next dev` loads `.env`, and `.env` on a developer machine holds live
 * credentials — so a key merely LEFT OUT of the overrides is not absent, it is
 * live. What that costs here is not email (sendEmail is inert outside
 * production) but telemetry: Sentry would file E2E errors into the production
 * project, and PostHog would push E2E events into the production funnel, which
 * is the very funnel this release added.
 *
 * The list is read from `.env` rather than written out here, because a
 * hand-maintained list of secrets to suppress is one that silently falls behind
 * the next credential someone adds.
 */
export function webServerEnv(): Record<string, string> {
  const overrides = e2eOverrides();
  const disabled: Record<string, string> = {};
  for (const key of envFileKeys()) {
    if (!(key in overrides)) disabled[key] = DISABLED;
  }
  // Anything that does escape the sentinel has nowhere to go: port 9 is discard.
  disabled.NEXT_PUBLIC_POSTHOG_HOST = "http://127.0.0.1:9";
  return { ...disabled, ...overrides };
}

function envFileKeys(): string[] {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key));
}
