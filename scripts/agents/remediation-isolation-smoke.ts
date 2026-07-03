/**
 * Isolation smoke: verifies the Docker container boundary for the remediation
 * executor. Requires Docker; skips gracefully if unavailable.
 *
 * Steps:
 *   1. Static arg check — isolatedDockerArgs() carries all required security flags.
 *   2. Image build — ensureImage(process.cwd()) builds/reuses the tagged image.
 *   3. Escape tests — malicious code runs inside Docker; all boundaries must hold:
 *        env:     host secrets not in container env
 *        network: TCP connection fails (--network none)
 *        ro:      write to /workspace/repo fails (worktree :ro)
 *        socket:  /var/run/docker.sock is not mounted
 *        timeout: infinite loop killed after timeoutMs
 *   4. Oracle-in-Docker — full kernel (reproduce → repair → PROPOSED) with Docker substrate.
 *
 * DATABASE_URL must point at the local test Postgres (step 4 uses the kernel DB):
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm remediation:isolation-smoke
 */
import "../eval/loadEnv";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db";
import {
  dockerVitestCheckRunner,
  ensureImage,
  isolatedDockerArgs,
} from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { buildRealRepoFixture, gradeDedupDefect } from "../../src/lib/agents/remediation/real/fixture";
import { assertIsolatedForUntrusted } from "../../src/lib/agents/remediation/isolated/guard";
import {
  claimRun,
  createRemediationRun,
  ingestIncident,
  transitionRun,
} from "../../src/lib/agents/remediation/store";
import { driveRepair, driveReproduction } from "../../src/lib/agents/remediation/driver";
import { fixtureRepairerFor } from "../../src/lib/agents/remediation/repair";
import type { CheckResult } from "../../src/lib/agents/remediation/substrate";

const execFileAsync = promisify(execFile);
const SMOKE_REPO = `__isolation_smoke__:${randomUUID()}`;
const WORKER = "isolation-smoke";

// ─── Guards ───────────────────────────────────────────────────────────────────

function assertLocalDb(): void {
  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error("DATABASE_URL is unset or unparseable; set it to the local test Postgres");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refuses non-local DB (host: ${host}); set DATABASE_URL to the local test Postgres`);
  }
}

async function checkDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["version"], {});
    return true;
  } catch {
    return false;
  }
}

// ─── Static arg verification ──────────────────────────────────────────────────

function assertArg(args: string[], flag: string, value?: string): void {
  const idx = args.indexOf(flag);
  if (idx === -1) throw new Error(`Security arg missing: ${flag}`);
  if (value !== undefined && args[idx + 1] !== value)
    throw new Error(`Expected ${flag} ${value}, got ${args[idx + 1]}`);
}

function verifyStaticArgs(): void {
  const args = isolatedDockerArgs({
    name: "verify",
    worktreeRoot: "/tmp/test-repo",
    outDir: "/tmp/test-out",
    image: "test:latest",
  });
  assertArg(args, "--network", "none");
  assertArg(args, "--read-only");
  assertArg(args, "--tmpfs", "/tmp");
  assertArg(args, "--cap-drop", "ALL");
  assertArg(args, "--security-opt", "no-new-privileges");
  // Worktree must be :ro
  const roMount = args.find((a) => a.includes("/tmp/test-repo") && a.endsWith(":ro"));
  if (!roMount) throw new Error("Worktree mount is not :ro");
  // Docker socket must NOT be mounted
  if (args.some((a) => a.includes("docker.sock")))
    throw new Error("docker.sock must not be mounted");
}

// ─── Escape test runner ───────────────────────────────────────────────────────

async function runEscapeTest(
  image: string,
  name: string,
  source: string,
  opts?: { timeoutMs?: number },
): Promise<CheckResult> {
  const worktree = await mkdtemp(join(tmpdir(), `escape-${name}-`));
  try {
    // The adapter config is the only project file we need — the escape tests don't
    // import any project code, so no tsconfig/package.json is required.
    await copyFile(
      join(process.cwd(), "vitest.adapter.config.mts"),
      join(worktree, "vitest.adapter.config.mts"),
    );
    const relPath = `__escape_${name}__.test.ts`;
    await writeFile(join(worktree, relPath), source);
    const runner = dockerVitestCheckRunner({
      image,
      tests: [relPath],
      timeoutMs: opts?.timeoutMs ?? 30_000,
    });
    return await runner(worktree, undefined);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
}

// ─── Escape test sources ──────────────────────────────────────────────────────

const ENV_TEST = `
import { describe, it, expect } from "vitest";
describe("env isolation", () => {
  it("host secrets are not in container env", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.AUTH_SECRET).toBeUndefined();
    expect(process.env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
`;

const NETWORK_TEST = `
import { describe, it } from "vitest";
import { createConnection } from "net";
describe("network isolation", () => {
  it("TCP connection fails (--network none)", () => new Promise<void>((resolve, reject) => {
    const sock = createConnection({ host: "1.1.1.1", port: 80, timeout: 2000 });
    sock.on("connect", () => { sock.destroy(); reject(new Error("ESCAPED: TCP connection succeeded")); });
    sock.on("error", () => { sock.destroy(); resolve(); });
    sock.on("timeout", () => { sock.destroy(); resolve(); });
  }));
});
`;

// The worktree is mounted at /workspace/repo and is read-only — any write attempt
// should throw with EROFS (or EPERM on newer kernels).
const READONLY_TEST = `
import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
describe("read-only worktree", () => {
  it("cannot write to /workspace/repo (EROFS)", () => {
    expect(() => writeFileSync("/workspace/repo/ESCAPED.txt", "escaped")).toThrow();
  });
});
`;

const SOCKET_TEST = `
import { describe, it, expect } from "vitest";
import { statSync } from "fs";
describe("no docker socket", () => {
  it("/var/run/docker.sock is not mounted", () => {
    expect(() => statSync("/var/run/docker.sock")).toThrow(/ENOENT/);
  });
});
`;

// Runs with a very short timeoutMs; the host timer kills the container.
const TIMEOUT_TEST = `
import { describe, it } from "vitest";
describe("timeout", () => {
  it("infinite loop is killed by host timer", () => { for (;;) {} });
});
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function label(result: CheckResult): string {
  if (result.kind === "completed") return `completed(exit ${result.exitCode})`;
  return `infra-failure: ${result.reason}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertLocalDb();

  const dockerAvailable = await checkDockerAvailable();
  if (!dockerAvailable) {
    console.log("Docker not available — skipping isolation smoke (not a failure)");
    return;
  }

  const passed: string[] = [];
  const failed: string[] = [];

  function record(name: string, ok: boolean, note = ""): void {
    const line = `${name}${note ? ` (${note})` : ""}`;
    (ok ? passed : failed).push(line);
    console.log(`  ${ok ? "✓" : "✗"} ${line}`);
    if (!ok) process.exitCode = 1;
  }

  // ── 1. Static arg check ────────────────────────────────────────────────────
  console.log("\n1. Static arg check");
  try {
    verifyStaticArgs();
    record("args:all-security-flags", true);
  } catch (e) {
    record("args:all-security-flags", false, String(e));
  }

  // ── 2. Build image ─────────────────────────────────────────────────────────
  console.log("\n2. Building remediation image (cached if deps unchanged)…");
  const t0 = Date.now();
  const image = await ensureImage(process.cwd());
  console.log(`   ${image} (${Date.now() - t0}ms)`);

  // ── 3. Escape tests ────────────────────────────────────────────────────────
  console.log("\n3. Escape tests");

  // Env: test should PASS (no host secrets in container env)
  {
    const r = await runEscapeTest(image, "env", ENV_TEST);
    record("escape:env", r.kind === "completed" && r.exitCode === 0, label(r));
  }

  // Network: test should PASS (connection error, not escape)
  {
    const r = await runEscapeTest(image, "network", NETWORK_TEST);
    record("escape:network", r.kind === "completed" && r.exitCode === 0, label(r));
  }

  // Read-only: test should PASS (write throws)
  {
    const r = await runEscapeTest(image, "readonly", READONLY_TEST);
    record("escape:readonly", r.kind === "completed" && r.exitCode === 0, label(r));
  }

  // No socket: test should PASS (stat throws ENOENT)
  {
    const r = await runEscapeTest(image, "socket", SOCKET_TEST);
    record("escape:socket", r.kind === "completed" && r.exitCode === 0, label(r));
  }

  // Timeout: must be an infra-failure with "timeout" in reason
  {
    const r = await runEscapeTest(image, "timeout", TIMEOUT_TEST, { timeoutMs: 4_000 });
    record(
      "escape:timeout",
      r.kind === "infrastructure-failure" && r.reason.includes("timeout"),
      label(r),
    );
  }

  // ── 4. Oracle-in-Docker smoke ──────────────────────────────────────────────
  console.log("\n4. Oracle-in-Docker smoke (reproduce → repair → PROPOSED)");
  const fixture = await buildRealRepoFixture(gradeDedupDefect(process.cwd()), {
    isolation: "docker",
    image,
  });
  // Guard: FixtureRepairer is trusted → passes; confirms guard is wired
  const repairer = fixtureRepairerFor(fixture);
  assertIsolatedForUntrusted(repairer, fixture);

  let incidentId: string | null = null;
  try {
    const incident = await ingestIncident({
      repository: SMOKE_REPO,
      defaultBranch: "main",
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, defectiveCommit: fixture.defectiveCommit },
    });
    incidentId = incident.id;
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, WORKER, 120_000))) throw new Error("failed to claim run");
    await transitionRun(run.id, WORKER, "RECEIVED", "TRIAGING");
    await transitionRun(run.id, WORKER, "TRIAGING", "CLASSIFIED");

    const t1 = Date.now();
    const reproOutcome = await driveReproduction(run.id, WORKER, fixture, { repeats: 2 });
    const repairOutcome =
      reproOutcome === "FIXING"
        ? await driveRepair(run.id, WORKER, fixture, repairer, { leaseMs: 120_000, heartbeatMs: 5_000 })
        : null;
    const t2 = Date.now();

    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    const ev = stored.evidence ? (JSON.parse(stored.evidence) as Record<string, unknown>) : null;

    const proposed = stored.phase === "PROPOSED";
    record(
      "oracle-in-docker:PROPOSED",
      proposed,
      `repro=${reproOutcome} repair=${repairOutcome} phase=${stored.phase} t=${t2 - t1}ms`,
    );
    if (proposed) {
      const gates = ev
        ? `redBeforeMatches=${ev.redBeforeMatches} greenAfter=${ev.greenAfter} holdout=${ev.holdoutPassed}`
        : "(no evidence)";
      console.log(`   gates: ${gates}`);
    }
  } finally {
    await fixture.cleanup();
    if (incidentId) await prisma.incident.deleteMany({ where: { id: incidentId } });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Passed: ${passed.length}  Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.join(", ")}`);
  } else {
    console.log("All isolation checks passed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
