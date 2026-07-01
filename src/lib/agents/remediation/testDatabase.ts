import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const EXPECTED_PORT = "5433";
const EXPECTED_DATABASE = "rpas_remediation_test";

export function remediationDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("REMEDIATION_TEST_DATABASE_URL is required");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  const port = url.port || "5432";
  // Fail closed to exactly one dedicated LOCAL database, so a future force-reset
  // can never point at a shared or remote database by accident. A substring check
  // is not enough — postgresql://production-host/prod_remediation must be rejected.
  // (A real CI host would relax this behind an explicit allowlist — not now.)
  if (!ALLOWED_HOSTS.has(url.hostname) || port !== EXPECTED_PORT || database !== EXPECTED_DATABASE) {
    throw new Error(
      `remediation tests require the dedicated local database localhost:${EXPECTED_PORT}/${EXPECTED_DATABASE} ` +
        `(got ${url.hostname}:${port}/${database || "?"})`,
    );
  }
  return url.toString();
}

function advisoryKey(repository: string): bigint {
  const bytes = createHash("sha256").update(repository).digest().subarray(0, 8);
  return bytes.readBigInt64BE();
}

export async function withRemediationDatabaseLock<T>(
  client: PrismaClient,
  repository: string,
  work: () => Promise<T>,
): Promise<T> {
  return client.$transaction(
    async (tx) => {
      // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns void, which
      // $queryRaw cannot deserialize. We only need to run it and wait for the lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey(repository)})`;
      return work();
    },
    { timeout: 10 * 60_000 },
  );
}
