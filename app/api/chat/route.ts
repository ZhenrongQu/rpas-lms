import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentAccount } from "../exam/sessionAuth";
import { hasPaidAccess } from "../../../src/lib/payments/entitlements";
import { enforceRateLimit } from "../../../src/lib/security/rateLimit";
import { runAssistant } from "../../../src/lib/agents/chat/loop";
import {
  buildScopeProbe,
  checkScope,
  scopeRefusal,
} from "../../../src/lib/agents/chat/rag/scopeGate";
import type { ToolContext } from "../../../src/lib/agents/chat/tools";

// Prisma + the Anthropic SDK need the Node runtime; the stream must not be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  locale: z.enum(["en", "zh"]).optional(),
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
    return new Response(scopeRefusal(ctx.locale), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  // 7. Stream the agent loop's text deltas back as plain UTF-8 chunks.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runAssistant(ctx, history, {
          onText: (delta) => controller.enqueue(encoder.encode(delta)),
          onTool: (name) => console.info(`[chat] user=${userId} tool=${name}`),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[chat] user=${userId} error: ${msg}`);
        controller.enqueue(
          encoder.encode(ctx.locale === "ZH" ? "\n\n（助教暂时出错了，请稍后再试。）" : "\n\n(The assistant hit an error — please try again.)"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
