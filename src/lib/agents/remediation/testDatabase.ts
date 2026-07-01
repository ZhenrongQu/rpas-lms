import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function remediationDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("REMEDIATION_TEST_DATABASE_URL is required");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!database || database === "postgres" || !database.includes("remediation")) {
    throw new Error("remediation tests require a dedicated database whose name contains remediation");
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
