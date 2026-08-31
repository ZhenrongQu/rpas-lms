import type Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { currentAccount } from "../exam/sessionAuth";
import { hasPaidAccess } from "../../../src/lib/payments/entitlements";
import { enforceRateLimit } from "../../../src/lib/security/rateLimit";
import { runAssistant, type AssistantRun } from "../../../src/lib/agents/chat/loop";
import { recordTurn } from "../../../src/lib/agents/chat/turnLog";
import { formatUsd, costMicroUsd } from "../../../src/lib/agents/chat/cost";
import {
  buildScopeProbe,
  checkScope,
  scopeRefusal,
} from "../../../src/lib/agents/chat/rag/scopeGate";
import type { ToolContext } from "../../../src/lib/agents/chat/tools";

// Prisma + the Anthropic SDK need the Node runtime; the stream must not be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The loop's own deadline (50s) sits under this, so an over-long turn ends as a
// recorded reply rather than a connection the platform severs with nothing
// written down. Previously neither budget existed and the platform default —
// whatever it happens to be — was the only limit.
export const maxDuration = 60;

const Body = z.object({
  locale: z.enum(["en", "zh"]).optional(),
  // Groups turns into a conversation. Client-supplied and therefore not trusted
  // for anything but grouping — every row is scoped by the session's userId, and
  // a forged id can only mislabel the forger's own turns.
  conversationId: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request): Promise<Response> {
  // 1. Auth — userId comes only from the verified session.
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth_required" }, { status: 401 });

  // 2. Paywall — assistant is a paid feature. Reject before spending any tokens.
  if (!(await hasPaidAccess(userId))) {
    return Response.json({ error: "payment_required" }, { status: 402 });
  }

  // 3. Rate limit (cost + abuse), per user.
  const limited = await enforceRateLimit(`chat:${userId}`, { limit: 20, windowSec: 60, blockSec: 60 });
  if (limited) return limited;

  // 4. Validate the conversation (reject malformed input regardless of config).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { messages, locale } = parsed.data;
  if (messages[messages.length - 1]!.role !== "user") {
    return Response.json({ error: "last_message_must_be_user" }, { status: 400 });
  }

  // 5. The assistant can't run without a key — fail clearly, don't 500.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "assistant_unavailable" }, { status: 503 });
  }

  const ctx: ToolContext = { userId, locale: locale === "zh" ? "ZH" : "EN" };
  const history: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  // Turn identity. turnIndex is derived server-side from the transcript rather
  // than accepted from the client, so it stays consistent even if the client
  // reuses or fabricates a conversation id.
  const conversationId = parsed.data.conversationId ?? crypto.randomUUID();
  // Allocated before the stream opens, not after it closes: the row is written at
  // the end, but the client needs the id in a header — and headers are long gone
  // by then. Sending it lets the student rate this specific answer, which is the
  // only signal in the system that does not come from us grading ourselves.
  const turnId = crypto.randomUUID();
  const turnIndex = messages.filter((m) => m.role === "user").length - 1;
  const question = messages[messages.length - 1]!.content;

  const textHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Turn-Id": turnId,
  };

  // 6. Scope gate — this assistant answers RPAS study questions only, and the
  // system prompt can't enforce that (the model can answer off-topic from its own
  // knowledge without ever calling a tool). This is the only gate that costs money
  // — one embedding call — so it sits after every free check above; it is still
  // orders of magnitude cheaper than the agent loop, so it sits before it. Off
  // unless SCOPE_MAX_COSINE_DISTANCE is set, and it fails open (see scopeGate.ts).
  // A refusal is a normal product response, not an error: same 200 text/plain
  // stream contract the client already reads.
  const verdict = await checkScope(buildScopeProbe(messages));
  if (!verdict.inScope) {
    console.info(`[chat] user=${userId} out_of_scope distance=${verdict.distance.toFixed(4)}`);
    const body = scopeRefusal(ctx.locale);
    // Recorded like any other turn: the refusal rate is the measurement this gate
    // needs before it can responsibly be turned on for paying students.
    await recordTurn({
      id: turnId,
      conversationId,
      turnIndex,
      userId,
      locale: ctx.locale,
      question,
      answer: body,
      historyTurns: messages.length - 1,
      completed: true,
      stopReason: "scope_refused",
    });
    return new Response(body, { headers: textHeaders });
  }

  // 7. Stream the agent loop's text deltas back as plain UTF-8 chunks.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let run: AssistantRun | undefined;
      let errorKind: string | null = null;

      const emit = (delta: string) => {
        answer += delta;
        controller.enqueue(encoder.encode(delta));
      };

      try {
        run = await runAssistant(ctx, history, {
          onText: emit,
          onTool: (name) => console.info(`[chat] user=${userId} tool=${name}`),
        });
      } catch (err) {
        errorKind = err instanceof Error ? err.constructor.name : "unknown";
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[chat] user=${userId} error: ${msg}`);
        // The route already answered 200 and streamed part of a reply, so this
        // failure is invisible to anything watching status codes. Sentry was
        // blind to every chat error for exactly this reason.
        Sentry.captureException(err, {
          tags: { area: "chat" },
          extra: { userId, conversationId, turnIndex },
        });
        emit(
          ctx.locale === "ZH"
            ? "\n\n（助教暂时出错了，请稍后再试。）"
            : "\n\n(The assistant hit an error — please try again.)",
        );
      } finally {
        // Awaited before close: on a serverless platform anything after the
        // response completes may simply not run, and the failed turns are the
        // ones worth keeping.
        await recordTurn({
          id: turnId,
          conversationId,
          turnIndex,
          userId,
          locale: ctx.locale,
          question,
          answer,
          historyTurns: messages.length - 1,
          completed: errorKind === null,
          errorKind,
          run,
        });
        if (run) {
          const cost = costMicroUsd(run.model, run);
          console.log(
            `[chat] user=${userId} conv=${conversationId} turn=${turnIndex} ` +
              `steps=${run.steps} stop=${run.stopReason} truncated=${run.truncated} ` +
              `in=${run.inputTokens} cache_read=${run.cacheReadTokens} out=${run.outputTokens} ` +
              `ttft=${run.ttftMs}ms total=${run.totalMs}ms cost=${cost === null ? "?" : formatUsd(cost)}`,
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: textHeaders });
}
