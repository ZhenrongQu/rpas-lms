import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE = "rpas_remediation_test";
const DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/postgres";

export function remediationDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("REMEDIATION_TEST_DATABASE_URL is required");
  const base = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL);
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  // Fail closed, but honour the repo's TEST_DATABASE_URL override contract: derive
  // the allowed host/port from the test baseline and only force the dedicated
  // database NAME. Together (baseline server + dedicated name) this still prevents
  // a force-reset from ever hitting a shared/remote or the baseline's own database.
  const sameServer = url.hostname === base.hostname && (url.port || "5432") === (base.port || "5432");
  if (!sameServer || database !== EXPECTED_DATABASE) {
    throw new Error(
      `remediation tests require the dedicated database "${EXPECTED_DATABASE}" on the test baseline server ` +
        `${base.hostname}:${base.port || "5432"} (got ${url.hostname}:${url.port || "5432"}/${database || "?"})`,
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
