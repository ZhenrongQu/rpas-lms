import { auth } from "../../../auth";
import { prisma } from "../db";

/** Returns the admin user (id + role) from the DB, or null. DB is the source of truth. */
export async function getCurrentAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  return user?.role === "ADMIN" ? user : null;
}

/** For admin API routes: returns a 404 Response for non-admins, or null to proceed. */
export async function requireAdminApi(): Promise<Response | null> {
  const admin = await getCurrentAdmin();
  return admin ? null : Response.json({ error: "not found" }, { status: 404 });
}
