import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminGrantSchema } from "../../../../../src/lib/flightReview/schemas";
import {
  grantFlightReviewCredit,
  revokeFlightReviewCredit,
} from "../../../../../src/lib/payments/entitlements";

type FindResult = { ok: true; customerId: string } | { ok: false; response: Response };

async function findCustomer(req: Request): Promise<FindResult> {
  const parsed = adminGrantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, response: Response.json({ error: parsed.error.flatten() }, { status: 422 }) };
  }
  const customer = await prisma.customer.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (!customer) {
    return { ok: false, response: Response.json({ error: "customer not found" }, { status: 404 }) };
  }
  return { ok: true, customerId: customer.id };
}

/** POST /api/<admin>/flight-review/grant — mint one review credit by email. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  await grantFlightReviewCredit(found.customerId);
  return Response.json({ ok: true }, { status: 200 });
}

/** DELETE /api/<admin>/flight-review/grant — revoke one spendable review credit
 *  by email. 409 when they have none left to take back: a credit already spent on
 *  a completed review is not clawed back here. */
export async function DELETE(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  if (!(await revokeFlightReviewCredit(found.customerId))) {
    return Response.json({ error: "no spendable credit" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
