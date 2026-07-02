import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { createRegressionFixture, type FixtureVariant, type RegressionFixture } from "./fixtures";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "./store";
import { driveRepair, driveReproduction } from "./driver";
import { fixtureRepairerFor, type Repairer } from "./repair";
import { LeaseLost, type RepairEvidence } from "./fixAttempt";
import { publishProposal } from "./publish";

const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

async function fixingRun(fingerprint: string): Promise<string> {
  const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint, payload: {} });
  const run = await createRemediationRun(incident.id);
  await claimRun(run.id, "worker-a", 60_000);
  await prisma.remediationRun.update({ where: { id: run.id }, data: { phase: "FIXING" } });
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
};

async function classifiedRun(fingerprint: string): Promise<string> {
  const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint, payload: {} });
  const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
  await claimRun(run.id, "worker-a", 60_000);
  await transitionRun(run.id, "worker-a", "RECEIVED", "TRIAGING");
  await transitionRun(run.id, "worker-a", "TRIAGING", "CLASSIFIED");
  return run.id;
}

async function drive(variant: FixtureVariant, fingerprint: string): Promise<string> {
  const fixture = await createRegressionFixture(variant === "reproducible" ? {} : { variant });
  created.push(fixture);
  const runId = await classifiedRun(fingerprint);
  const outcome = await driveReproduction(runId, "worker-a", fixture, { repeats: 2 });
  const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
  expect(stored.phase).toBe(outcome); // the phase machine agrees with the returned outcome
  return outcome;
}

describe("driveReproduction", () => {
  it("drives a reproducible defect to FIXING", async () => {
    expect(await drive("reproducible", "drive-fixing")).toBe("FIXING");
  });

  it("drives an already-fixed defect to ALREADY_FIXED", async () => {
    expect(await drive("already-fixed", "drive-fixed")).toBe("ALREADY_FIXED");
  });

  it("routes a non-portable reproduction to NEEDS_HUMAN", async () => {
    expect(await drive("non-portable", "drive-nonportable")).toBe("NEEDS_HUMAN");
  });

  it("routes a broken control to NOT_REPRODUCIBLE", async () => {
    expect(await drive("control-broken", "drive-control")).toBe("NOT_REPRODUCIBLE");
  });

  it("cannot be driven by a non-lease-owner", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await classifiedRun("drive-lease");
    await expect(driveReproduction(runId, "worker-b", fixture, { repeats: 2 })).rejects.toThrow(
      "lost lease or CAS race",
    );
  });
});

describe("driveRepair", () => {
  it("drives a fixable defect FIXING → PROPOSED with a real patch", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun("repair-ok");
    const outcome = await driveRepair(runId, "worker-a", fixture, fixtureRepairerFor(fixture), { heartbeatMs: 20 });
    expect(outcome).toBe("PROPOSED");
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("PROPOSED");
    expect(run.evidence).toBeTruthy();
    const versions = await prisma.externalActionVersion.findMany();
    expect(versions).toHaveLength(1);
    expect(versions[0]!.patch).toContain("score.mjs");
  });

  it("resumes from PROPOSING after a crash without duplicating the proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "repair-resume", payload: {} });
    const run = await createRemediationRun(incident.id);
    await claimRun(run.id, "worker-a", 60_000);
    await prisma.remediationRun.update({ where: { id: run.id }, data: { phase: "PROPOSING", evidence: JSON.stringify(EVIDENCE) } });
    await publishProposal(run.id, { body: "b", patch: EVIDENCE.patch, evidence: JSON.stringify(EVIDENCE) }); // already published pre-crash

    const outcome = await driveRepair(run.id, "worker-a", fixture, fixtureRepairerFor(fixture));
    expect(outcome).toBe("PROPOSED");
    expect(await prisma.externalActionVersion.count()).toBe(1); // no duplicate
  });

  it("routes an unfixed defect to NEEDS_HUMAN with no proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun("repair-nofix");
    const noop: Repairer = { async repair() {} };
    const outcome = await driveRepair(runId, "worker-a", fixture, noop, { heartbeatMs: 20 });
    expect(outcome).toBe("NEEDS_HUMAN");
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("NEEDS_HUMAN");
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("aborts on lease loss, leaving the phase resumable and no proposal", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun("repair-lease-loss");
    let n = 0;
    const sleeper: Repairer = {
      async repair(ctx) {
        await new Promise<void>((res, rej) => {
          const t = setTimeout(res, 10_000);
          ctx.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }, { once: true });
        });
      },
    };
    await expect(
      driveRepair(runId, "worker-a", fixture, sleeper, { heartbeatMs: 20, _beat: async () => ++n < 2 }),
    ).rejects.toBeInstanceOf(LeaseLost);
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("FIXING");
    expect(run.evidence).toBeNull();
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("a non-lease-owner cannot commit the repair transition", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const runId = await fixingRun("repair-owner");
    await expect(driveRepair(runId, "worker-b", fixture, fixtureRepairerFor(fixture))).rejects.toThrow(
      "lost lease or CAS race",
    );
    const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.phase).toBe("FIXING");
  });
});
