import { Prisma, type RemediationRun } from "@prisma/client";
import { prisma } from "../../db";
import { assertTransition } from "./state";
import { ACTIVE_PHASES, TERMINAL_PHASES, type RemediationPhase } from "./types";

type IncidentInput = {
  repository: string;
  defaultBranch: string;
  fingerprint: string;
  payload: unknown;
};

const ACTIVE = ACTIVE_PHASES as readonly string[];
const TERMINAL = TERMINAL_PHASES as readonly string[];

export async function ingestIncident(input: IncidentInput) {
  const { repository, defaultBranch, fingerprint, payload } = input;
  const key = { repository_defaultBranch_fingerprint: { repository, defaultBranch, fingerprint } };
  const latestPayload = JSON.stringify(payload);
  try {
    return await prisma.incident.upsert({
      where: key,
      create: { repository, defaultBranch, fingerprint, latestPayload },
      update: { occurrenceCount: { increment: 1 }, latestPayload },
    });
  } catch (e) {
    // upsert is not atomic against a concurrent FIRST insert of the same
    // fingerprint (two sources arriving at once) — one wins the insert, the other
    // hits P2002. The row now exists, so apply as the update it should have been.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.incident.update({
        where: key,
        data: { occurrenceCount: { increment: 1 }, latestPayload },
      });
    }
    throw e;
  }
}

/** Create a run for an incident with the next cycle number, allocated atomically
 *  (max+1, retry on the unique-constraint race). Recurrence = a new cycle. */
export async function createRemediationRun(incidentId: string): Promise<RemediationRun> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const agg = await prisma.remediationRun.aggregate({ where: { incidentId }, _max: { cycle: true } });
    const cycle = (agg._max.cycle ?? 0) + 1;
    try {
      return await prisma.remediationRun.create({ data: { incidentId, cycle } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // lost the cycle race
      throw e;
    }
  }
  throw new Error(`could not allocate a cycle for incident ${incidentId}`);
}

export async function claimRun(runId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.remediationRun.updateMany({
    where: {
      id: runId,
      phase: { in: [...ACTIVE] }, // a finished (terminal) run is never claimable
      OR: [{ leaseOwner: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { leaseOwner: workerId, leaseExpiresAt },
  });
  return claimed.count === 1;
}

export async function heartbeatRun(runId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, leaseOwner: workerId, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
  return updated.count === 1;
}

export async function transitionRun(
  runId: string,
  workerId: string,
  expected: RemediationPhase,
  next: RemediationPhase,
): Promise<void> {
  assertTransition(expected, next);
  // Entering a terminal phase releases the lease, so a finished run holds no stale
  // owner and cannot be mistaken for in-flight work.
  const clearLease = TERMINAL.includes(next);
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, phase: expected, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } },
    data: clearLease ? { phase: next, leaseOwner: null, leaseExpiresAt: null } : { phase: next },
  });
  if (updated.count !== 1) throw new Error(`run ${runId} lost lease or CAS race`);
}

/** Like transitionRun but writes `evidence` in the SAME lease/CAS updateMany, so
 *  the run reaches `next` iff its evidence is persisted (crash-safe resume). */
export async function transitionRunWithEvidence(
  runId: string,
  workerId: string,
  expected: RemediationPhase,
  next: RemediationPhase,
  evidence: string,
): Promise<void> {
  assertTransition(expected, next);
  const clearLease = TERMINAL.includes(next);
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, phase: expected, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } },
    data: clearLease
      ? { phase: next, evidence, leaseOwner: null, leaseExpiresAt: null }
      : { phase: next, evidence },
  });
  if (updated.count !== 1) throw new Error(`run ${runId} lost lease or CAS race`);
}
