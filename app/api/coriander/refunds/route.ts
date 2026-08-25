import { z } from "zod";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import { approveRefund, listRefundRequests, rejectRefund } from "../../../../src/lib/payments/refunds";

const DecisionBody = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).optional(),
}).strict();

/** GET /api/<admin>/refunds — the review queue. */
export async function GET(): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  return Response.json({ requests: await listRefundRequests() }, { status: 200 });
}

/** POST /api/<admin>/refunds — approve (refund + revoke) or reject one request. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = DecisionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const { requestId, decision, note } = parsed.data;

  if (decision === "REJECT") {
    if (!(await rejectRefund(requestId, note))) {
      return Response.json({ error: "request is not pending" }, { status: 409 });
    }
    return Response.json({ ok: true, status: "REJECTED" }, { status: 200 });
  }

  const result = await approveRefund(requestId, note);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, status: result.status }, { status: 200 });
}
