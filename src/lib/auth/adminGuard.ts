import { auth } from "../../../auth";
import { prisma } from "../db";

/** Returns the admin (id) from the DB, or null. DB is the source of truth.
 *  Admins live in their own table; the session must be an admin session AND the
 *  id must exist in `Admin`. A customer session can never pass this. */
export async function getCurrentAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !session?.user?.isAdmin) return null;
  const admin = await prisma.admin.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return admin ?? null;
}

/** For admin API routes: returns a 404 Response for non-admins, or null to proceed. */
export async function requireAdminApi(): Promise<Response | null> {
  const admin = await getCurrentAdmin();
  return admin ? null : Response.json({ error: "not found" }, { status: 404 });
}
