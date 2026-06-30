import { prisma } from "../db";
import { recordStep } from "./trace";
import { SDLC_STAGES, type Stage } from "./sdlc/stages";

/**
 * The pipeline engine — a durable, resumable state machine. This is the reusable
 * *mechanism*: it knows about stages, ordering, and gates, but nothing about what
 * a PRD or RFC is (that's stages.ts).
 *
 * The defining property: at every approval gate the engine PERSISTS state to the
 * AgentRun row and returns (the process exits). A later `applyDecision` call runs
 * in a fresh process, reloads the row from the DB, and resumes from the next
 * stage. State lives in the DB, never in process memory — that is what makes the
 * human gate able to wait indefinitely, out of band.
 *
 * Status machine: running → awaiting_approval → (approve) running → … → done
 *                                             → (reject)  rejected
 *                 running → (stage throws)    → failed
 */

const KIND = "sdlc";
const STAGES: Stage[] = SDLC_STAGES;

export type GateAction = "approve" | "reject";

/** Start a new run and advance until the first gate (or completion). Returns the run id. */
export async function startRun(idea: string): Promise<string> {
  const run = await prisma.agentRun.create({
    data: { kind: KIND, input: idea, status: "running", artifacts: "{}" },
  });
  await advance(run.id, 0);
  return run.id;
}

/** Apply a human decision at the current gate, then resume (approve) or stop (reject). */
export async function applyDecision(
  runId: string,
  action: GateAction,
  note?: string,
): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "awaiting_approval" || !run.currentStage) {
    throw new Error(`Run ${runId} is not awaiting approval (status: ${run.status}).`);
  }

  // Record the decision in the audit trail before acting on it.
  await recordStep(runId, run.currentStage, "gate", { action, note });

  if (action === "reject") {
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "rejected" } });
    return;
  }

  const idx = STAGES.findIndex((s) => s.name === run.currentStage);
  await prisma.agentRun.update({ where: { id: runId }, data: { status: "running" } });
  await advance(runId, idx + 1);
}

/**
 * Run stages from `fromIndex` onward. Loads run state fresh from the DB (so it
 * works identically whether called from startRun or from a cold resume). Stops —
 * persisting state and returning — at the first stage that requires approval.
 */
async function advance(runId: string, fromIndex: number): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  const artifacts: Record<string, string> = JSON.parse(run.artifacts);

  for (let i = fromIndex; i < STAGES.length; i++) {
    const stage = STAGES[i]!;

    let result;
    try {
      result = await stage.run({ runId, idea: run.input, artifacts });
    } catch (e) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "failed", currentStage: stage.name },
      });
      throw e;
    }

    artifacts[stage.name] = result.text;
    await recordStep(runId, stage.name, "stage", result.text, result.tokens);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { artifacts: JSON.stringify(artifacts) },
    });

    if (stage.requiresApproval) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "awaiting_approval", currentStage: stage.name },
      });
      return; // ← the durable gate: persist + stop. Resume happens in a new process.
    }
  }

  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "done", currentStage: null },
  });
}

/** Load a run plus its ordered trace, for the CLI to display. */
export function getRun(runId: string) {
  return prisma.agentRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });
}
