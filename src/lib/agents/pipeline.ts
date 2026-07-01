import { prisma } from "../db";

/**
 * The pipeline engine — a durable, resumable state machine, decoupled from any
 * specific pipeline. Pipelines register their stages by `kind`; the engine looks
 * them up by the run's kind, so a cold resume (a fresh `approve` process) finds
 * the right stages and tests can register stub stages with no LLM.
 *
 * Status machine: running → awaiting_approval → (approve) running → … → done
 *                                             → (reject)  rejected
 *                 running → (stage throws)    → failed   (recoverable via resumeRun)
 */

export type StageContext = {
  runId: string;
  input: string;
  artifacts: Record<string, string>; // prior stage outputs, keyed by stage name
};

export type Stage = {
  name: string;
  requiresApproval: boolean;
  run: (ctx: StageContext) => Promise<{ text: string; tokens: number }>;
};

export type GateAction = "approve" | "reject";

const REGISTRY: Record<string, Stage[]> = {};

export function registerPipeline(kind: string, stages: Stage[]): void {
  REGISTRY[kind] = stages;
}

function stagesFor(kind: string): Stage[] {
  const stages = REGISTRY[kind];
  if (!stages) throw new Error(`no pipeline registered for kind "${kind}"`);
  return stages;
}

/** Start a new run and advance until the first gate (or completion). Returns the run id. */
export async function startRun(kind: string, input: string): Promise<string> {
  const run = await prisma.agentRun.create({
    data: { kind, input, status: "running", artifacts: "{}" },
  });
  await advance(run.id, 0);
  return run.id;
}

/** Apply a human decision at the current gate, then resume (approve) or stop (reject). */
export async function applyDecision(runId: string, action: GateAction, note?: string): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "awaiting_approval" || !run.currentStage) {
    throw new Error(`Run ${runId} is not awaiting approval (status: ${run.status}).`);
  }

  const stage = run.currentStage;
  // Claim + record the decision in ONE transaction so a crash can't leave the run
  // advanced with no audit row (or an audit row with no advance). The conditional
  // update matches only while the run is still awaiting at THIS stage; a racing
  // second approve sees count === 0 and the whole transaction rolls back, so there
  // is no double-advance / duplicate side effect. The gate step's id is derived
  // from (run, stage) so the decision is recorded at most once even on a retry.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.agentRun.updateMany({
      where: { id: runId, status: "awaiting_approval", currentStage: stage },
      data: { status: action === "approve" ? "running" : "rejected" },
    });
    if (claimed.count === 0) {
      throw new Error(`Run ${runId} was already decided (lost the race).`);
    }
    await tx.agentStep.create({
      data: { id: `gate:${runId}:${stage}`, runId, stage, kind: "gate", output: JSON.stringify({ action, note }) },
    });
  });

  if (action === "approve") {
    const idx = stagesFor(run.kind).findIndex((s) => s.name === stage);
    await advance(runId, idx + 1);
  }
}

/**
 * Recover a run left mid-flight by a crash — either still "running" (died before
 * the state flip) or "failed" (a stage threw). Re-runs from the first stage that
 * has no artifact yet, so a stage interrupted mid-draft is simply redone.
 *
 * Concurrency: the claim is pinned on the observed (status, updatedAt), so two
 * near-simultaneous resumes can't both proceed — the first bumps updatedAt and the
 * second's conditional update matches nothing. (A second resume that starts AFTER
 * the first is already executing a stage is a narrow operator-error window for a
 * manual recovery command; the only harmful replay — duplicate tickets — is itself
 * neutralised by TicketFiler's per-run reset. A heartbeat lease is the production
 * upgrade, out of scope for the sandbox.)
 */
export async function resumeRun(runId: string): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "running" && run.status !== "failed") {
    throw new Error(`Run ${runId} is not recoverable (status: ${run.status}).`);
  }
  const claimed = await prisma.agentRun.updateMany({
    where: { id: runId, status: run.status, updatedAt: run.updatedAt },
    data: { status: "running" },
  });
  if (claimed.count === 0) {
    throw new Error(`Run ${runId} is already being resumed (lost the race).`);
  }
  const stages = stagesFor(run.kind);
  const artifacts: Record<string, string> = JSON.parse(run.artifacts);
  const missing = stages.findIndex((s) => !(s.name in artifacts));
  await advance(runId, missing === -1 ? stages.length : missing);
}

/**
 * Run stages from `fromIndex` onward. Loads run state fresh from the DB (so it
 * works identically from startRun or a cold resume). Each stage's trace row and
 * state flip are written in ONE transaction, so a crash can't leave a half-written
 * gate. Stops — persisting state — at the first stage that requires approval.
 */
async function advance(runId: string, fromIndex: number): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  const stages = stagesFor(run.kind);
  const artifacts: Record<string, string> = JSON.parse(run.artifacts);

  for (let i = fromIndex; i < stages.length; i++) {
    const stage = stages[i]!;

    let result;
    try {
      result = await stage.run({ runId, input: run.input, artifacts });
    } catch (e) {
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "failed", currentStage: stage.name },
      });
      throw e;
    }
    artifacts[stage.name] = result.text;

    const gate = stage.requiresApproval;
    await prisma.$transaction([
      prisma.agentStep.create({
        data: { runId, stage: stage.name, kind: "stage", output: JSON.stringify(result.text), tokens: result.tokens },
      }),
      prisma.agentRun.update({
        where: { id: runId },
        data: gate
          ? { artifacts: JSON.stringify(artifacts), status: "awaiting_approval", currentStage: stage.name }
          : { artifacts: JSON.stringify(artifacts) },
      }),
    ]);

    if (gate) return; // durable gate: persist + stop. Resume happens in a new process.
  }

  await prisma.agentRun.update({
    where: { id: runId },
    data: { artifacts: JSON.stringify(artifacts), status: "done", currentStage: null },
  });
}

/** Load a run plus its ordered trace, for the CLI to display. */
export function getRun(runId: string) {
  return prisma.agentRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });
}
