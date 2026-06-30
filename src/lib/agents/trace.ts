import { prisma } from "../db";

/**
 * Observability primitive: append one AgentStep row per stage draft and per gate
 * decision. JSON payloads are stringified to match the codebase convention of
 * storing JSON in String columns (see ExamSession.answers etc.).
 */
export async function recordStep(
  runId: string,
  stage: string,
  kind: "stage" | "gate",
  output: unknown,
  tokens?: number,
): Promise<void> {
  await prisma.agentStep.create({
    data: {
      runId,
      stage,
      kind,
      output: output === undefined ? null : JSON.stringify(output),
      tokens: tokens ?? null,
    },
  });
}
