import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { claimRun, heartbeatRun, ingestIncident, transitionRun } from "./store";

afterEach(async () => {
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

describe("remediation store", () => {
  it("deduplicates incidents and increments occurrences", async () => {
    const first = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "typeerror:scoreExam:34",
      payload: { eventId: "one" },
    });
    const second = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "typeerror:scoreExam:34",
      payload: { eventId: "two" },
    });

    expect(second.id).toBe(first.id);
    expect(second.occurrenceCount).toBe(2);
    expect(JSON.parse(second.latestPayload)).toEqual({ eventId: "two" });
  });

  it("allows exactly one lease claimant", async () => {
    const incident = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "lease-race",
      payload: {},
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });

    const claims = await Promise.all([
      claimRun(run.id, "worker-a", 60_000),
      claimRun(run.id, "worker-b", 60_000),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("requires the active lease owner for a CAS transition", async () => {
    const incident = await ingestIncident({
      repository: "rpas-lms",
      defaultBranch: "feat/sdlc-agent",
      fingerprint: "transition-lease",
      payload: {},
    });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    expect(await claimRun(run.id, "worker-a", 60_000)).toBe(true);

    await expect(transitionRun(run.id, "worker-b", "RECEIVED", "TRIAGING")).rejects.toThrow("lost lease or CAS race");
    await transitionRun(run.id, "worker-a", "RECEIVED", "TRIAGING");
    await expect(transitionRun(run.id, "worker-a", "RECEIVED", "FIXING")).rejects.toThrow();

    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("TRIAGING");
  });

  it("heartbeats only for the active lease owner", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "heartbeat", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    await claimRun(run.id, "worker-a", 60_000);
    expect(await heartbeatRun(run.id, "worker-b", 60_000)).toBe(false);
    expect(await heartbeatRun(run.id, "worker-a", 60_000)).toBe(true);
  });
});
