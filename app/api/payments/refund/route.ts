import { z } from "zod";
import { prisma } from "../../../../src/lib/db";
import { requestRefund } from "../../../../src/lib/payments/refunds";
import { currentAccount } from "../../exam/sessionAuth";
import { enforceRateLimit } from "../../../../src/lib/security/rateLimit";

const Body = z.object({
  paymentId: z.string().min(1),
  reason: z.string().min(1).max(1000),
}).strict();

/** GET /api/payments/refund — the caller's payments and any refund already filed,
 *  so the dashboard can offer a refund on the right purchase. */
export async function GET(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });

  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      product: true,
      amountTotal: true,
      currency: true,
      status: true,
      createdAt: true,
      refundRequests: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return Response.json({
    payments: payments.map((p) => ({
      id: p.id,
      product: p.product,
      amountTotal: p.amountTotal,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      refundStatus: p.refundRequests[0]?.status ?? null,
    })),
  });
}

/** POST /api/payments/refund — file a refund request (PRD U5). Reviewed by an
 *  admin; nothing is refunded or revoked here. */
export async function POST(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });

  // Requests are read by a human, so cap them: without this the review queue is
  // trivially floodable.
  const limited = await enforceRateLimit(`refund:user:${userId}`, {
    limit: 5,
    windowSec: 24 * 60 * 60,
    blockSec: 24 * 60 * 60,
  });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 422 });

  const result = await requestRefund(userId, parsed.data.paymentId, parsed.data.reason);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.error === "payment_not_found" ? 404 : 409 },
    );
  }
  return Response.json({ ok: true, requestId: result.requestId }, { status: 201 });
}
