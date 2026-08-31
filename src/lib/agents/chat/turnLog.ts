import { prisma } from "../../db";
import { costMicroUsd } from "./cost";
import { redact } from "./redact";
import type { AssistantRun } from "./loop";

/**
 * Persist one assistant turn.
 *
 * Two properties this must have, in priority order:
 *
 *  1. It must never affect the reply. The student already has their answer by the
 *     time this runs; a logging fault turning into a user-visible error would make
 *     the observability layer a new source of the failures it exists to measure.
 *     So every error is caught here and reported, never rethrown.
 *  2. It must record failures as loudly as successes. A turn that broke mid-stream
 *     is the interesting one, and it is exactly the turn a naive implementation
 *     drops — the route already returned 200, so nothing else will notice.
 */
export type RecordTurnInput = {
  /** Allocated by the route before streaming, so the client can be handed it in a
   *  response header and rate this exact turn later. */
  id?: string;
  conversationId: string;
  turnIndex: number;
  userId: string;
  locale: "EN" | "ZH";
  question: string;
  answer: string;
  /** Messages sent with this request, excluding the new one — the context-growth signal. */
  historyTurns: number;
  completed: boolean;
  errorKind?: string | null;
  /** Absent on paths that never reach the model (the scope gate's refusal). */
  run?: AssistantRun;
  /** Used when there is no `run` to read it from. */
  stopReason?: string;
};

/** Injectable for the test that proves a failing write cannot escape. */
type TurnWriter = { assistantTurn: { create: (args: { data: object }) => Promise<unknown> } };

export async function recordTurn(
  t: RecordTurnInput,
  db: TurnWriter = prisma as unknown as TurnWriter,
): Promise<void> {
  try {
    const run = t.run;
    await db.assistantTurn.create({
      data: {
        ...(t.id ? { id: t.id } : {}),
        conversationId: t.conversationId,
        turnIndex: t.turnIndex,
        userId: t.userId,
        locale: t.locale,
        question: redact(t.question),
        answer: redact(t.answer),
        historyTurns: t.historyTurns,
        // No model call means no model — "scope_gate" would be a lie in a column
        // that feeds per-model cost aggregates.
        model: run?.model ?? "none",
        stopReason: run?.stopReason ?? t.stopReason ?? null,
        truncated: run?.truncated ?? false,
        exhaustedSteps: run?.exhaustedSteps ?? false,
        timedOut: run?.timedOut ?? false,
        completed: t.completed,
        errorKind: t.errorKind ?? null,
        steps: run?.steps ?? 0,
        toolCalls: JSON.stringify(run?.toolCalls ?? []),
        inputTokens: run?.inputTokens ?? 0,
        outputTokens: run?.outputTokens ?? 0,
        cacheReadTokens: run?.cacheReadTokens ?? 0,
        cacheWriteTokens: run?.cacheWriteTokens ?? 0,
        costMicroUsd: run ? costMicroUsd(run.model, run) : 0,
        ttftMs: run?.ttftMs ?? null,
        totalMs: run?.totalMs ?? 0,
      },
    });
  } catch (err) {
    // Reported, not thrown. See property 1 above.
    console.error(
      `[chat] failed to record turn user=${t.userId} conversation=${t.conversationId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
