import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentAccount } from "../exam/sessionAuth";
import { hasPaidAccess } from "../../../src/lib/payments/entitlements";
import { enforceRateLimit } from "../../../src/lib/security/rateLimit";
import { runAssistant } from "../../../src/lib/chat/loop";
import type { ToolContext } from "../../../src/lib/chat/tools";

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

  // 6. Stream the agent loop's text deltas back as plain UTF-8 chunks.
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
