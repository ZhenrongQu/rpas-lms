import { redirect } from "next/navigation";
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

/** For admin server pages: redirect non-admins to sign-in. */
export async function requireAdmin(locale: string): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect(`/${locale}/signin`);
  }
}

/** For admin API routes: returns a 403 Response for non-admins, or null to proceed. */
export async function requireAdminApi(): Promise<Response | null> {
  const admin = await getCurrentAdmin();
  return admin ? null : Response.json({ error: "forbidden" }, { status: 403 });
}
