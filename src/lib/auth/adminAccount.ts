import { prisma } from "../db";
import { verifyPassword } from "./password";

type AdminLoginInput = {
  email?: string;
  username?: string;
  phone?: string;
  password?: string;
};

/**
 * Authorizes an admin against the `Admin` table (physically separate from
 * customers). Admins sign in with a username or email; there is no `role` field
 * anywhere, so a customer can never satisfy this check.
 */
export async function authorizeAdminPasswordLogin(input: AdminLoginInput) {
  if (!input.password) return null;
  const identifier = input.email ?? input.username ?? input.phone;
  if (!identifier) return null;
  const normalized = identifier.trim().toLowerCase();

  const admin = await prisma.admin.findFirst({
    where: { OR: [{ username: normalized }, { email: normalized }] },
  });
  if (!admin?.hashedPassword) return null;

  const ok = await verifyPassword(input.password, admin.hashedPassword);
  return ok ? admin : null;
}
