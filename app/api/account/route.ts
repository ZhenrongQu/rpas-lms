import { auth } from "../../../auth";
import { prisma } from "../../../src/lib/db";

// DELETE /api/account — permanently delete the signed-in customer's account.
// Cookie-session auth (web). Cascades remove identities, sessions, lesson
// progress, payments, entitlements, and any flight-review booking; exam
// sessions are anonymized (their optional userId is set to null).
export async function DELETE(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.customer.delete({ where: { id: userId } });

  return Response.json({ ok: true });
}
