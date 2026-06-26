import { prisma } from "../../../../src/lib/db";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";

// DELETE /api/mobile/account — permanently delete the signed-in account
// (Apple Guideline 5.1.1(v): in-app account deletion).
// Cascades remove identities, sessions, lesson progress, payments,
// entitlements, and any flight-review booking; exam sessions are
// anonymized (their optional userId is set to null).
export async function DELETE(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  await prisma.customer.delete({ where: { id: auth.account.userId } });

  return Response.json({ ok: true });
}
