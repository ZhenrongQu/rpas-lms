import { z } from "zod";
import { currentAccount } from "../../exam/sessionAuth";
import { prisma } from "../../../../src/lib/db";

// Prisma needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  turnId: z.string().uuid(),
  // -1 or 1 only. A three-value scale is the most a student will actually use,
  // and anything finer would be a rating we cannot interpret consistently later.
  rating: z.union([z.literal(-1), z.literal(1)]),
});

/**
 * The only signal in this system that does not come from us grading ourselves.
 *
 * Everything else the assistant records — truncation, step exhaustion, tool
 * calls, cost — is the product's opinion of its own behaviour. Without a human
 * saying "this answer was wrong", every failure rate is self-assessed, and an
 * LLM judge calibrated against nothing but our own rubric inherits the same
 * blind spot.
 */
export async function POST(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth_required" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  // Scoped by userId in the WHERE clause, not checked after a fetch: a turn
  // belonging to someone else is indistinguishable from one that doesn't exist,
  // so this cannot be used to probe for other students' turn ids.
  const { count } = await prisma.assistantTurn.updateMany({
    where: { id: parsed.data.turnId, userId },
    data: { rating: parsed.data.rating, ratedAt: new Date() },
  });
  if (count === 0) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({ ok: true });
}
