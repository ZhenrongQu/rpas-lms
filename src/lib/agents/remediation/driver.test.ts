import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { createRegressionFixture, type FixtureVariant, type RegressionFixture } from "./fixtures";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "./store";
import { driveRepair, driveReproduction } from "./driver";
import { FixtureRepairer, fixtureRepairerFor, type RepairContext, type RepairReport } from "./repair";
import { LeaseLost, type RepairEvidence } from "./fixAttempt";
import { publishProposal } from "./publish";

const created: RegressionFixture[] = [];

// A deterministic, TEST-AUTHORED oracle repairer — trusted via the FixtureRepairer
// oracle family (its repair() runs test-written JS writing test-controlled source, so
// host execution is safe). Untrusted authors (LlmRepairer) get no trust and must run
// isolated. Test-only (defined in a *.test.ts).
class OracleRepairer extends FixtureRepairer {
  constructor(private readonly fn: (ctx: RepairContext) => Promise<RepairReport | void>) {
    super("", "");
  }
  override repair(ctx: RepairContext): Promise<RepairReport | void> {
    return this.fn(ctx);
  }
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

// An incident that genuinely corresponds to the fixture's defect (same fingerprint),
// so reproduction's incident/fixture correlation check passes.
function incidentFor(fixture: RegressionFixture) {
  return ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: fixture.incident.fingerprint, payload: {} });
}

// Fabricate the post-reproduction state: a claimed run at FIXING with the target
// already frozen (as driveReproduction would have done).
async function fixingRun(fixture: RegressionFixture): Promise<string> {
  const incident = await incidentFor(fixture);
  const run = await createRemediationRun(incident.id);
  await claimRun(run.id, "worker-a", 60_000);
  await prisma.remediationRun.update({ where: { id: run.id }, data: { phase: "FIXING", target: frozenTarget(fixture) } });
  return run.id;
}

const EVIDENCE: RepairEvidence = {
  baseCommit: "x",
  reproductionHash: "h",
  reproductionIntact: true,
  redBeforeMatches: true,
  redBeforeSignature: null,
  greenAfter: true,
  changedFiles: ["src/score.mjs"],
  diffLines: 2,
  hasBinaryDiff: false,
  patch: "PATCH",
  patchBytes: 5,
  patchTooLarge: false,
  holdoutPassed: true,
};

// Mirror driver.buildTarget for a run whose incident is repository "rpas-lms" / "main".
function frozenTarget(fixture: RegressionFixture) {
  return {
    repository: "rpas-lms",
    defaultBranch: "main",
    fingerprint: fixture.incident.fingerprint,
    mainCommit: fixture.mainCommit,
    defectiveCommit: fixture.defectiveCommit,
    knownGoodCommit: fixture.knownGoodCommit,
    sourceRelPath: fixture.sourceRelPath,
  };
}

async function classifiedRun(fixture: RegressionFixture): Promise<string> {
  const incident = await incidentFor(fixture);
  const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
  await claimRun(run.id, "worker-a", 60_000);
  await transitionRun(run.id, "worker-a", "RECEIVED", "TRIAGING");
  await transitionRun(run.id, "worker-a", "TRIAGING", "CLASSIFIED");
  return run.id;
}

async function drive(variant: FixtureVariant): Promise<string> {
  const fixture = await createRegressionFixture(variant === "reproducible" ? {} : { variant });
  created.push(fixture);
  const runId = await classifiedRun(fixture);
  const outcome = await driveReproduction(runId, "worker-a", fixture, { repeats: 2 });
  const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
  expect(stored.phase).toBe(outcome); // the phase machine agrees with the returned outcome
  return outcome;
}

describe("driveReproduction", () => {
  it("drives a reproducible defect to FIXING", async () => {
    expect(await drive("reproducible")).toBe("FIXING");
  });

  it("drives an already-fixed defect to ALREADY_FIXED", async () => {
    expect(await drive("already-fixed")).toBe("ALREADY_FIXED");
  });

  it("routes a non-portable reproduction to NEEDS_HUMAN", async () => {
    expect(await drive("non-portable")).toBe("NEEDS_HUMAN");
  });

  it("routes a broken control to NOT_REPRODUCIBLE", async () => {
    expect(await drive("control-broken")).toBe("NOT_REPRODUCIBLE");
  });

  it("escalates to NEEDS_HUMAN when the fixture does not belong to the incident", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    // incident is for a DIFFERENT defect than the fixture reproduces
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "some-other-defect", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    await claimRun(run.id, "worker-a", 60_000);
    await transitionRun(run.id, "worker-a", "RECEIVED", "TRIAGING");
    await transitionRun(run.id, "worker-a", "TRIAGING", "CLASSIFIED");

    expect(await driveReproduction(run.id, "worker-a", fixture, { repeats: 2 })).toBe("NEEDS_HUMAN");
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("NEEDS_HUMAN");
    expect(stored.target).toBeNull(); // never froze a target under the wrong incident
  });

  it("cannot be driven by a non-lease-owner", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await classifiedRun(fixture);
    await expect(driveReproduction(runId, "worker-b", fixture, { repeats: 2 })).rejects.toThrow(
      "lost lease or CAS race",
    );
  });

  it("freezes the reproduced target atomically when advancing to FIXING", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await classifiedRun(fixture);
    expect(await driveReproduction(runId, "worker-a", fixture, { repeats: 2 })).toBe("FIXING");
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("FIXING");
    // the target is anchored at reproduction, not at first repair
    expect(run.target).toMatchObject({
      repository: "rpas-lms",
      defaultBranch: "main",
      mainCommit: fixture.mainCommit,
      defectiveCommit: fixture.defectiveCommit,
      knownGoodCommit: fixture.knownGoodCommit,
      sourceRelPath: "src/score.mjs",
    });
  });
});

describe("driveRepair", () => {
  it("drives a fixable defect FIXING → PROPOSED with a real patch", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun(fixture);
    const outcome = await driveRepair(runId, "worker-a", fixture, fixtureRepairerFor(fixture), { heartbeatMs: 20 });
    expect(outcome).toBe("PROPOSED");
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("PROPOSED");
    expect(run.evidence).toBeTruthy();
    expect(run.policy).toMatchObject({ repair: { pinnedPaths: ["src/check.mjs"] } }); // policy frozen on the run
    const versions = await prisma.externalActionVersion.findMany();
    expect(versions).toHaveLength(1);
    expect(versions[0]!.patch).toContain("score.mjs");
  });

  it("verifies against the policy frozen at repair time, not the caller's later args", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const incident = await incidentFor(fixture);
    const run = await createRemediationRun(incident.id);
    await claimRun(run.id, "worker-a", 60_000);
    // parked at VERIFYING with a LENIENT frozen policy + small evidence
    await prisma.remediationRun.update({
      where: { id: run.id },
      data: {
        phase: "VERIFYING",
        evidence: JSON.stringify(EVIDENCE),
        target: frozenTarget(fixture),
        policy: {
          verify: { allowedPaths: ["src/score.mjs"], maxFiles: 5, maxDiffLines: 200, maxPatchBytes: 1000 },
          repair: { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"], readAllowlist: ["src/"] },
        },
      },
    });
    // the caller passes a STRICTER arg (maxPatchBytes: 1) that WOULD reject if used
    const outcome = await driveRepair(run.id, "worker-a", fixture, fixtureRepairerFor(fixture), { maxPatchBytes: 1 });
    expect(outcome).toBe("PROPOSED"); // frozen lenient policy won, the stricter arg was ignored
  });

  it("escalates to NEEDS_HUMAN when a resume is handed a different target", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const incident = await incidentFor(fixture);
    const run = await createRemediationRun(incident.id);
    await claimRun(run.id, "worker-a", 60_000);
    await prisma.remediationRun.update({
      where: { id: run.id },
      data: {
        phase: "VERIFYING",
        evidence: JSON.stringify(EVIDENCE),
        // frozen against a DIFFERENT commit than the fixture we will resume with
        target: { ...frozenTarget(fixture), mainCommit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
        policy: {
          verify: { allowedPaths: ["src/score.mjs"], maxFiles: 5, maxDiffLines: 200, maxPatchBytes: 1_000_000 },
          repair: { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"], readAllowlist: ["src/"] },
        },
      },
    });
    // resume: the fixture's real target no longer matches the frozen one
    const outcome = await driveRepair(run.id, "worker-a", fixture, fixtureRepairerFor(fixture));
    expect(outcome).toBe("NEEDS_HUMAN");
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("NEEDS_HUMAN");
    expect(await prisma.externalActionVersion.count()).toBe(0); // never verified/published a wrong repair
  });

  it("refuses an invalid starting phase without writing any policy", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const incident = await incidentFor(fixture);
    const run = await createRemediationRun(incident.id);
    await claimRun(run.id, "worker-a", 60_000);
    await prisma.remediationRun.update({ where: { id: run.id }, data: { phase: "CLASSIFIED" } });
    await expect(driveRepair(run.id, "worker-a", fixture, fixtureRepairerFor(fixture))).rejects.toThrow(/cannot run from phase/);
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.policy).toBeNull(); // phase checked before the freeze
  });

  it("resumes from PROPOSING after a crash without duplicating the proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const incident = await incidentFor(fixture);
    const run = await createRemediationRun(incident.id);
    await claimRun(run.id, "worker-a", 60_000);
    await prisma.remediationRun.update({ where: { id: run.id }, data: { phase: "PROPOSING", evidence: JSON.stringify(EVIDENCE), target: frozenTarget(fixture) } });
    await publishProposal(run.id, "worker-a"); // already published pre-crash

    const outcome = await driveRepair(run.id, "worker-a", fixture, fixtureRepairerFor(fixture));
    expect(outcome).toBe("PROPOSED");
    expect(await prisma.externalActionVersion.count()).toBe(1); // no duplicate
  });

  it("routes an unfixed defect to NEEDS_HUMAN with no proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun(fixture);
    const noop = new OracleRepairer(async () => {});
    const outcome = await driveRepair(runId, "worker-a", fixture, noop, { heartbeatMs: 20 });
    expect(outcome).toBe("NEEDS_HUMAN");
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("NEEDS_HUMAN");
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("aborts on lease loss, leaving the phase resumable and no proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun(fixture);
    let n = 0;
    const sleeper = new OracleRepairer(async (ctx) => {
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, 10_000);
        ctx.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }, { once: true });
      });
    });
    await expect(
      driveRepair(runId, "worker-a", fixture, sleeper, { heartbeatMs: 20, _beat: async () => ++n < 2 }),
    ).rejects.toBeInstanceOf(LeaseLost);
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("FIXING");
    expect(run.evidence).toBeNull();
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("rejects a non-lease-owner BEFORE running any repair work", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun(fixture);
    let called = false;
    const spy = new OracleRepairer(async () => { called = true; });
    await expect(driveRepair(runId, "worker-b", fixture, spy)).rejects.toThrow("lost lease or CAS race");
    expect(called).toBe(false); // fast-failed before the expensive fix attempt
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("FIXING");
  });
});
