import { prisma } from "../../db";

const KIND = "draft_pr";

export type ProposalInput = { body: string; patch: string; evidence: string };

/**
 * Publish (or supersede) the remediation proposal for a run's cycle. Idempotent
 * and concurrency-safe by construction — never catch-P2002-inside-a-transaction
 * (that aborts the PG tx): identity and version are created with
 * `createMany({ skipDuplicates })` (ON CONFLICT DO NOTHING), and the pointer is
 * advanced with an atomic `GREATEST`.
 */
export async function publishProposal(
  runId: string,
  { body, patch, evidence }: ProposalInput,
): Promise<{ actionId: string; version: number }> {
  const run = await prisma.remediationRun.findUniqueOrThrow({ where: { id: runId }, include: { incident: true } });
  const inc = run.incident;

  await prisma.externalAction.createMany({
    data: [
      {
        kind: KIND,
        incidentId: inc.id,
        repository: inc.repository,
        defaultBranch: inc.defaultBranch,
        fingerprint: inc.fingerprint,
      },
    ],
    skipDuplicates: true,
  });
  const action = await prisma.externalAction.findUniqueOrThrow({
    where: { incidentId_kind: { incidentId: inc.id, kind: KIND } },
  });

  await prisma.externalActionVersion.createMany({
    data: [{ actionId: action.id, cycle: run.cycle, version: run.cycle, body, patch, evidence }],
    skipDuplicates: true, // replay of the same cycle is a silent no-op
  });

  await prisma.$executeRaw`UPDATE "ExternalAction" SET "currentVersion" = GREATEST("currentVersion", ${run.cycle}), "status" = 'open' WHERE id = ${action.id}`;

  return { actionId: action.id, version: run.cycle };
}
