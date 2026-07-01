import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { remediationDatabaseUrl, withRemediationDatabaseLock } from "./testDatabase";

describe("remediation test database", () => {
  it("rejects a missing or ordinary developer database URL", () => {
    expect(() => remediationDatabaseUrl(undefined)).toThrow("REMEDIATION_TEST_DATABASE_URL is required");
    expect(() => remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5433/postgres")).toThrow(
      "dedicated database",
    );
  });

  it("rejects a remote host even when the name looks dedicated", () => {
    expect(() => remediationDatabaseUrl("postgresql://user:pw@production-host:5432/prod_remediation")).toThrow(
      "dedicated database",
    );
  });

  it("rejects a database on a different port than the test baseline", () => {
    expect(() => remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5432/rpas_remediation_test")).toThrow(
      "dedicated database",
    );
  });

  it("accepts the dedicated remediation database on the baseline server", () => {
    expect(remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5433/rpas_remediation_test")).toContain(
      "/rpas_remediation_test",
    );
  });

  it("derives the allowed host/port from TEST_DATABASE_URL (override contract)", () => {
    const saved = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5544/postgres";
    try {
      // The dedicated DB on the overridden server is accepted...
      expect(
        remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5544/rpas_remediation_test"),
      ).toContain("/rpas_remediation_test");
      // ...while the old default port is now rejected (it no longer matches the baseline).
      expect(() =>
        remediationDatabaseUrl("postgresql://postgres:postgres@localhost:5433/rpas_remediation_test"),
      ).toThrow("dedicated database");
    } finally {
      if (saved === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = saved;
    }
  });

  it("serializes two holders of the same advisory lock", async () => {
    const url = remediationDatabaseUrl(process.env.REMEDIATION_TEST_DATABASE_URL);
    const a = new PrismaClient({ datasources: { db: { url } } });
    const b = new PrismaClient({ datasources: { db: { url } } });
    const order: string[] = [];
    let releaseA!: () => void;
    let enteredA!: () => void;
    const aMayExit = new Promise<void>((resolve) => { releaseA = resolve; });
    const aEntered = new Promise<void>((resolve) => { enteredA = resolve; });
    try {
      const first = withRemediationDatabaseLock(a, "rpas-lms", async () => {
        order.push("a:start");
        enteredA();
        await aMayExit;
        order.push("a:end");
      });
      await aEntered;
      const second = withRemediationDatabaseLock(b, "rpas-lms", async () => {
        order.push("b:start");
        order.push("b:end");
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(order).toEqual(["a:start"]);
      releaseA();
      await Promise.all([first, second]);
      expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    } finally {
      await Promise.all([a.$disconnect(), b.$disconnect()]);
    }
  });
});
