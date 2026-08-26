import { afterEach, describe, expect, it } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertWritableDbTarget,
  describeDbTarget,
  isLocalDbTarget,
  loadEnvFile,
  resolveDbUrl,
} from "./dbTarget";

const LOCAL = "postgresql://postgres:postgres@localhost:5433/postgres";
const REMOTE = "postgresql://u:p@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("ops database target", () => {
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it("describes a target without leaking credentials", () => {
    const described = describeDbTarget(REMOTE);

    expect(described).toBe("aws-1-us-west-1.pooler.supabase.com:6543/postgres");
    expect(described).not.toContain("u:p");
  });

  it("defaults the port when the URL omits it", () => {
    expect(describeDbTarget("postgresql://h/appdb")).toBe("h:5432/appdb");
  });

  it("recognises the loopback forms as local", () => {
    expect(isLocalDbTarget(LOCAL)).toBe(true);
    expect(isLocalDbTarget("postgresql://x@127.0.0.1:5432/postgres")).toBe(true);
    expect(isLocalDbTarget("postgresql://x@[::1]:5432/postgres")).toBe(true);
    expect(isLocalDbTarget(REMOTE)).toBe(false);
  });

  it("allows writing to a local database without any opt-in", () => {
    expect(() => assertWritableDbTarget(LOCAL, false)).not.toThrow();
  });

  // The actual incident: `pnpm db:indexes` on a dev machine resolved DATABASE_URL
  // from .env and applied DDL to the live database.
  it("refuses to write to a remote database by default", () => {
    expect(() => assertWritableDbTarget(REMOTE, false)).toThrow(/Refusing to write/);
    expect(() => assertWritableDbTarget(REMOTE, false)).toThrow(/ALLOW_REMOTE_DB_WRITE=1/);
  });

  it("names the host it refused, so the operator can see what it was about to hit", () => {
    expect(() => assertWritableDbTarget(REMOTE, false)).toThrow(/pooler\.supabase\.com/);
  });

  it("allows a remote write once the operator opts in", () => {
    expect(() => assertWritableDbTarget(REMOTE, true)).not.toThrow();
  });

  it("prefers an explicit URL over the environment", () => {
    process.env.DATABASE_URL = REMOTE;

    expect(resolveDbUrl(LOCAL)).toBe(LOCAL);
    expect(resolveDbUrl()).toBe(REMOTE);
  });

  it("fails with a readable message when there is no URL at all", () => {
    delete process.env.DATABASE_URL;

    expect(() => resolveDbUrl()).toThrow(/No database URL/);
  });
});

describe("loadEnvFile", () => {
  const file = join(tmpdir(), `dbtarget-env-${process.pid}`);
  const KEY = "OPS_DBTARGET_PROBE";
  const OTHER = "OPS_DBTARGET_PROBE_PRESET";

  afterEach(() => {
    delete process.env[KEY];
    delete process.env[OTHER];
    rmSync(file, { force: true });
  });

  it("reads quoted and unquoted values, ignoring comments and blanks", () => {
    writeFileSync(file, `# a comment\n\n${KEY}="${LOCAL}"\n`);

    loadEnvFile(file);

    expect(process.env[KEY]).toBe(LOCAL);
  });

  // The precedence the Prisma CLI and Next both use: an inline override on the
  // command line must beat the file, or a guarded deploy command would check the
  // file's database while reshaping the one the operator named.
  it("does not override a variable that is already set", () => {
    process.env[OTHER] = "already-set";
    writeFileSync(file, `${OTHER}=from-file\n`);

    loadEnvFile(file);

    expect(process.env[OTHER]).toBe("already-set");
  });

  it("is a no-op when the file does not exist", () => {
    expect(() => loadEnvFile(join(tmpdir(), "definitely-not-here-12345"))).not.toThrow();
  });
});
