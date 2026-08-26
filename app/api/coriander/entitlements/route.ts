import { z } from "zod";
import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import {
  grantPaidAccessEntitlement,
  revokePaidAccessEntitlement,
} from "../../../../src/lib/payments/entitlements";

/** Admin grant/revoke of course access (paid_access) by customer email. */
const adminEntitlementSchema = z.object({ email: z.string().email() });

type FindResult = { ok: true; customerId: string } | { ok: false; response: Response };

async function findCustomer(req: Request): Promise<FindResult> {
  const parsed = adminEntitlementSchema.safeParse(await req.json().catch(() => null));
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

/** POST /api/<admin>/entitlements — grant paid_access by email. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  await grantPaidAccessEntitlement(found.customerId);
  return Response.json({ ok: true }, { status: 200 });
}

/** DELETE /api/<admin>/entitlements — revoke paid_access by email (DEF-001 / U5). */
export async function DELETE(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const found = await findCustomer(req);
  if (!found.ok) return found.response;

  await revokePaidAccessEntitlement(found.customerId);
  return Response.json({ ok: true }, { status: 200 });
}
