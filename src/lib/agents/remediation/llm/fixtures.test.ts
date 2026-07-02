import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../../db";
import { createRepairCases, type RepairCase } from "./fixtures";
import { fixtureRepairerFor } from "../repair";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../store";
import { driveRepair, driveReproduction } from "../driver";

const cases: RepairCase[] = [];

afterEach(async () => {
  await Promise.all(cases.splice(0).map((c) => c.cleanup()));
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

// Drive a case through the real kernel with the deterministic ORACLE repairer, so
// the fixtures are validated without the model. Returns the reached outcome.
async function driveWithOracle(c: RepairCase): Promise<string> {
  const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: c.incident.fingerprint, payload: {} });
  const run = await createRemediationRun(incident.id);
  await claimRun(run.id, "w", 60_000);
  await transitionRun(run.id, "w", "RECEIVED", "TRIAGING");
  await transitionRun(run.id, "w", "TRIAGING", "CLASSIFIED");
  const repro = await driveReproduction(run.id, "w", c, { repeats: 2 });
  if (repro !== "FIXING") return repro;
  return driveRepair(run.id, "w", c, fixtureRepairerFor(c), { heartbeatMs: 50 });
}

describe("graded repair-case catalog", () => {
  it("every case reproduces, and the oracle reaches the declared expectedOutcome", async () => {
    const built = await createRepairCases();
    cases.push(...built);
    for (const c of built) {
      expect(await driveWithOracle(c), c.id).toBe(c.expectedOutcome);
    }
  });
});
