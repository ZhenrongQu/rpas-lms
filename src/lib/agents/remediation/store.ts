import { prisma } from "../../db";
import { assertTransition } from "./state";
import type { RemediationPhase } from "./types";

type IncidentInput = {
  repository: string;
  defaultBranch: string;
  fingerprint: string;
  payload: unknown;
};

export function ingestIncident(input: IncidentInput) {
  const { repository, defaultBranch, fingerprint, payload } = input;
  const key = {
    repository_defaultBranch_fingerprint: {
      repository,
      defaultBranch,
      fingerprint,
    },
  };
  return prisma.incident.upsert({
    where: key,
    create: { repository, defaultBranch, fingerprint, latestPayload: JSON.stringify(payload) },
    update: { occurrenceCount: { increment: 1 }, latestPayload: JSON.stringify(payload) },
  });
}

export async function claimRun(runId: string, workerId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.remediationRun.updateMany({
    where: {
      id: runId,
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
  const updated = await prisma.remediationRun.updateMany({
    where: { id: runId, phase: expected, leaseOwner: workerId, leaseExpiresAt: { gt: new Date() } },
    data: { phase: next },
  });
  if (updated.count !== 1) throw new Error(`run ${runId} lost lease or CAS race`);
}
