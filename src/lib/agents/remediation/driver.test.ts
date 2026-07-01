import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { createRegressionFixture, type FixtureVariant, type RegressionFixture } from "./fixtures";
import { claimRun, ingestIncident, transitionRun } from "./store";
import { driveReproduction } from "./driver";

const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

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
