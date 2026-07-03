import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { FixtureRepairer, fixtureRepairerFor, type RepairContext, type RepairReport } from "./repair";
import { LeaseLost, runFixAttempt } from "./fixAttempt";
import { InfrastructureFailure, type CheckRunner } from "./substrate";

const infraRunner: CheckRunner = async () => ({ kind: "infrastructure-failure", reason: "docker unavailable" });

// A deterministic, TEST-AUTHORED oracle repairer. It is trusted (extends
// FixtureRepairer, so the oracle-family constructor registers it), which is honest:
// its repair() runs test-written JS and the source it writes is test-controlled, so
// executing on the host is safe. The kernel's isolation is therefore not required —
// only UNTRUSTED authors (LlmRepairer, which implements Repairer directly and gets NO
// trust) must run in Docker. This construct is test-only (defined in a *.test.ts).
class OracleRepairer extends FixtureRepairer {
  constructor(private readonly fn: (ctx: RepairContext) => Promise<RepairReport | void>) {
    super("", "");
  }
  override repair(ctx: RepairContext): Promise<RepairReport | void> {
    return this.fn(ctx);
  }
}

const execFileAsync = promisify(execFile);
const POLICY = { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"], readAllowlist: ["src/"] };
const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((f) => f.cleanup()));
});

async function worktreeCount(repoRoot: string): Promise<number> {
  const { stdout } = await execFileAsync("git", ["worktree", "list"], { cwd: repoRoot });
  return stdout.split("\n").filter(Boolean).length;
}

function countingBeat(returns: (n: number) => boolean) {
  const state = { calls: 0 };
  return { state, beat: async () => (state.calls++, returns(state.calls)) };
}

function delay(ms: number, signal: AbortSignal, reject = false): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject ? rej(new Error("aborted")) : res(); }, { once: true });
  });
}

describe("runFixAttempt", () => {
  it("captures durable evidence with a real patch for a reproducible fixture", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const hb = countingBeat(() => true);
    const evidence = await runFixAttempt(fixture, fixtureRepairerFor(fixture), {
      policy: POLICY,
      maxPatchBytes: 1_000_000,
      heartbeat: { intervalMs: 20, beat: hb.beat },
    });
    expect(evidence.redBeforeMatches).toBe(true);
    expect(evidence.greenAfter).toBe(true);
    expect(evidence.holdoutPassed).toBe(true);
    expect(evidence.reproductionIntact).toBe(true);
    expect(evidence.changedFiles).toEqual(["src/score.mjs"]);
    expect(evidence.hasBinaryDiff).toBe(false);
    expect(evidence.patchTooLarge).toBe(false);
    expect(evidence.patch).toContain("score.mjs");
    expect(evidence.patch).toContain("@@");
    expect(evidence.baseCommit).toBe(fixture.mainCommit);
    expect(evidence.trace).toBeUndefined(); // the oracle repairer returns no report
    expect(hb.state.calls).toBeGreaterThanOrEqual(1);
    expect(await worktreeCount(fixture.repoRoot)).toBe(1);
  });

  it("persists a repairer's redacted trace in the evidence", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const reporting = new OracleRepairer(async (ctx) => {
      await ctx.writeFile("src/score.mjs", fixture.fixedSource);
      return { trace: [{ step: 0, tokens: 12, reasoning: "guarded", tools: [{ name: "write_file", status: "executed", path: "src/score.mjs", contentBytes: 42, contentSha256: "abcd" }] }], tokens: 12 };
    });
    const evidence = await runFixAttempt(fixture, reporting, { policy: POLICY, maxPatchBytes: 1_000_000 });
    expect(evidence.greenAfter).toBe(true);
    expect(evidence.trace).toHaveLength(1);
    expect(evidence.trace![0]!.tools[0]!.name).toBe("write_file");
  });

  it("runs the hidden holdout: a hardcode games the visible check but fails the holdout", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const hardcode = new OracleRepairer(async (ctx) => {
      await ctx.writeFile("src/score.mjs", "export function score() {\n  return 0;\n}\n");
    });
    const evidence = await runFixAttempt(fixture, hardcode, { policy: POLICY, maxPatchBytes: 1_000_000 });
    expect(evidence.greenAfter).toBe(true); // score([], 0) === 0 → visible check passes
    expect(evidence.holdoutPassed).toBe(false); // but score([{score:5}], 0) !== 5 → holdout catches it
    expect(await worktreeCount(fixture.repoRoot)).toBe(1); // holdout injection is cleaned up too
  });

  it("keeps the lease alive across a slow attempt (multiple beats)", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const hb = countingBeat(() => true);
    const slow = new OracleRepairer(async (ctx) => {
      await delay(50, ctx.signal); // ~2.5 intervals
      await ctx.writeFile(fixture.sourceRelPath, fixture.fixedSource);
    });
    await runFixAttempt(fixture, slow, { policy: POLICY, maxPatchBytes: 1_000_000, heartbeat: { intervalMs: 20, beat: hb.beat } });
    expect(hb.state.calls).toBeGreaterThanOrEqual(2);
  });

  it("aborts with LeaseLost when the lease is lost mid-repair", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const hb = countingBeat((n) => n < 2); // true once, then false
    const sleeper = new OracleRepairer(async (ctx) => { await delay(10_000, ctx.signal, true); });
    await expect(
      runFixAttempt(fixture, sleeper, { policy: POLICY, maxPatchBytes: 1_000_000, heartbeat: { intervalMs: 20, beat: hb.beat } }),
    ).rejects.toBeInstanceOf(LeaseLost);
    expect(await worktreeCount(fixture.repoRoot)).toBe(1);
  });

  it("flags an oversized patch at capture time (real overflow)", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const evidence = await runFixAttempt(fixture, fixtureRepairerFor(fixture), { policy: POLICY, maxPatchBytes: 10 });
    expect(evidence.patchTooLarge).toBe(true);
    expect(evidence.patchBytes).toBeGreaterThan(0);
    expect(evidence.patch.length).toBeLessThanOrEqual(2000);
  });

  it("detects an out-of-band change to the pinned reproduction (hash backstop)", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const evidence = await runFixAttempt(fixture, fixtureRepairerFor(fixture), {
      policy: POLICY,
      maxPatchBytes: 1_000_000,
      _tamperCheckAfterRepair: async (wt) => writeFile(join(wt, "src/check.mjs"), "process.exit(0)\n"),
    });
    expect(evidence.reproductionIntact).toBe(false);
  });

  it("propagates an InfrastructureFailure instead of producing a false red/green", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const down = { ...fixture, substrate: { ...fixture.substrate, runCheck: infraRunner } };
    await expect(
      runFixAttempt(down, fixtureRepairerFor(fixture), { policy: POLICY, maxPatchBytes: 1_000_000 }),
    ).rejects.toBeInstanceOf(InfrastructureFailure);
    expect(await worktreeCount(fixture.repoRoot)).toBe(1); // worktree still cleaned up
  });
});
