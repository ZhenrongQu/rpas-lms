import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminGrantSchema } from "../../../../../src/lib/flightReview/schemas";
import {
  grantFlightReviewEntitlement,
  revokeFlightReviewEntitlement,
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

/** POST /api/<admin>/flight-review/grant — grant flight_review eligibility by email. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  await grantFlightReviewEntitlement(found.customerId);
  return Response.json({ ok: true }, { status: 200 });
}

/** DELETE /api/<admin>/flight-review/grant — revoke flight_review eligibility by email. */
export async function DELETE(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  await revokeFlightReviewEntitlement(found.customerId);
  return Response.json({ ok: true }, { status: 200 });
}
