import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { claimRun, createRemediationRun, freezeRunPolicy, heartbeatRun, ingestIncident, transitionRun, transitionRunWithEvidence } from "./store";

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

  it("increments to exactly N under concurrent first-ingest of a new fingerprint", async () => {
    const ingest = () =>
      ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "concurrent-new", payload: {} });
    await Promise.all(Array.from({ length: 5 }, ingest));
    const rows = await prisma.incident.findMany({ where: { fingerprint: "concurrent-new" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.occurrenceCount).toBe(5);
  });

  it("refuses to claim a run already in a terminal phase", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "terminal-claim", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id, phase: "PROPOSED" } });
    expect(await claimRun(run.id, "worker-a", 60_000)).toBe(false);
  });

  it("releases the lease when a run enters a terminal phase", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "terminal-lease", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id } });
    await claimRun(run.id, "worker-a", 60_000);
    await transitionRun(run.id, "worker-a", "RECEIVED", "CANCELLED");
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("CANCELLED");
    expect(stored.leaseOwner).toBeNull();
    expect(stored.leaseExpiresAt).toBeNull();
  });

  it("allocates sequential cycles for one incident", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "cycle-seq", payload: {} });
    const a = await createRemediationRun(incident.id);
    const b = await createRemediationRun(incident.id);
    expect(a.cycle).toBe(1);
    expect(b.cycle).toBe(2);
  });

  it("allocates distinct cycles under concurrent creates", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "cycle-conc", payload: {} });
    const runs = await Promise.all(Array.from({ length: 4 }, () => createRemediationRun(incident.id)));
    expect(new Set(runs.map((r) => r.cycle))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("freezeRunPolicy is first-writer-wins: a later caller never clobbers the persisted value", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "freeze-race", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id, phase: "FIXING", cycle: 1 } });
    await claimRun(run.id, "worker-a", 60_000);
    // winner already persisted policy A
    await prisma.remediationRun.update({ where: { id: run.id }, data: { policy: { tag: "A" } } });

    // a second caller tries to write B — the atomic `policy IS NULL` predicate blocks
    // it and (still holding the lease) it reads back the winner instead.
    const got = await freezeRunPolicy(run.id, "worker-a", { tag: "B" });
    expect(got).toEqual({ tag: "A" });
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.policy).toEqual({ tag: "A" }); // B never overwrote A
  });

  it("freezeRunPolicy throws when the caller lost the lease and nothing is frozen", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "freeze-lease", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id, phase: "FIXING", cycle: 1 } });
    await claimRun(run.id, "worker-a", 60_000);
    await expect(freezeRunPolicy(run.id, "worker-b", { tag: "B" })).rejects.toThrow("lost lease or CAS race");
    const stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.policy).toBeNull();
  });

  it("freezeRunPolicy throws if the lease expired even when a policy is already frozen", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "freeze-stale", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id, phase: "FIXING", cycle: 1 } });
    await claimRun(run.id, "worker-a", 60_000);
    // a winner froze the policy, but our lease has since expired — we must STOP, not
    // proceed on the stale read.
    await prisma.remediationRun.update({
      where: { id: run.id },
      data: { policy: { tag: "A" }, leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(freezeRunPolicy(run.id, "worker-a", { tag: "B" })).rejects.toThrow("lost lease or CAS race");
  });

  it("writes phase and evidence atomically, only for the lease owner", async () => {
    const incident = await ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint: "evidence-cas", payload: {} });
    const run = await prisma.remediationRun.create({ data: { incidentId: incident.id, phase: "FIXING", cycle: 1 } });
    await claimRun(run.id, "worker-a", 60_000);

    await expect(
      transitionRunWithEvidence(run.id, "worker-b", "FIXING", "VERIFYING", '{"patch":"x"}'),
    ).rejects.toThrow("lost lease or CAS race");
    let stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("FIXING");
    expect(stored.evidence).toBeNull();

    await transitionRunWithEvidence(run.id, "worker-a", "FIXING", "VERIFYING", '{"patch":"x"}');
    stored = await prisma.remediationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.phase).toBe("VERIFYING");
    expect(JSON.parse(stored.evidence!)).toEqual({ patch: "x" });
  });
});
