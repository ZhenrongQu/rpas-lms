import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertWritableDbTarget,
  describeDbTarget,
  isLocalDbTarget,
  guardDbWrite,
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

  // Two projects in the same region print the same host, so the ref is the only
  // thing left to tell them apart — and it lives in the username, next to the
  // password that must never be logged.
  it("names the Supabase project a pooled URL points at", () => {
    const described = describeDbTarget(
      "postgresql://postgres.abcdefghijklmnopqrst:s3cret@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );

    expect(described).toBe(
      "aws-1-us-west-1.pooler.supabase.com:6543/postgres (project abcdefghijklmnopqrst)",
    );
    expect(described).not.toContain("s3cret");
  });

  it("separates two projects that share a region", () => {
    const host = "aws-1-us-west-1.pooler.supabase.com:6543";
    const dev = describeDbTarget(`postgresql://postgres.devref:p@${host}/postgres`);
    const prod = describeDbTarget(`postgresql://postgres.prodref:p@${host}/postgres`);

    expect(dev).not.toBe(prod);
  });

  it("says nothing about a project for a plain postgres URL", () => {
    expect(describeDbTarget(LOCAL)).toBe("localhost:5433/postgres");
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

// The guard the eight non-deploy ops scripts run before their first query. It
// exists because @prisma/client loads .env on import — even under tsx, which
// does not — so `tsx scripts/seed-content.ts` connects to whatever that file
// names with nothing on screen to say which database that is.
describe("guardDbWrite", () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalOptIn = process.env.ALLOW_REMOTE_DB_WRITE;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    if (originalOptIn === undefined) delete process.env.ALLOW_REMOTE_DB_WRITE;
    else process.env.ALLOW_REMOTE_DB_WRITE = originalOptIn;
    vi.restoreAllMocks();
  });

  function runWith(url: string, optIn?: string, options?: { dryRun?: boolean }) {
    process.env.DATABASE_URL = url;
    if (optIn === undefined) delete process.env.ALLOW_REMOTE_DB_WRITE;
    else process.env.ALLOW_REMOTE_DB_WRITE = optIn;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    return { log, run: () => guardDbWrite(options) };
  }

  it("announces the target and returns it for a local database", () => {
    const { log, run } = runWith(LOCAL);

    expect(run()).toBe(LOCAL);
    expect(log).toHaveBeenCalledWith("→ target: localhost:5433/postgres");
  });

  // The line that has to be on screen even when the command is allowed to run:
  // the incident was not a refused write, it was an unannounced one.
  it("announces the target before refusing a remote one", () => {
    const { log, run } = runWith(REMOTE);

    expect(run).toThrow(/Refusing to write/);
    expect(log).toHaveBeenCalledWith("→ target: aws-1-us-west-1.pooler.supabase.com:6543/postgres");
  });

  it("allows a remote target once the operator opts in", () => {
    const { run } = runWith(REMOTE, "1");

    expect(run()).toBe(REMOTE);
  });

  it("does not treat any other value of the opt-in as consent", () => {
    const { run } = runWith(REMOTE, "true");

    expect(run).toThrow(/Refusing to write/);
  });

  // A dry run reads. Refusing it would push operators toward passing the write
  // opt-in for a read, which is how an opt-in stops meaning anything.
  it("lets a dry run see a remote target, marked read-only", () => {
    const { log, run } = runWith(REMOTE, undefined, { dryRun: true });

    expect(run()).toBe(REMOTE);
    expect(log).toHaveBeenCalledWith(
      "→ target: aws-1-us-west-1.pooler.supabase.com:6543/postgres (dry run, read-only)",
    );
  });
});
