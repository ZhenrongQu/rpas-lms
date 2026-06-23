import { prisma } from "../db";
import { verifyPassword } from "./password";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "./totp";

// SEC-16: admin TOTP enrollment lifecycle. A secret is "pending" once generated
// and becomes "active" only after the admin confirms a code (proving their
// authenticator is set up). Both enabling (confirm) and disabling require the
// current password (P2-2 step-up reauth) plus a code, so a hijacked session
// alone can neither bind a new second factor nor strip the existing one.

const ISSUER = "RPAS Admin";

export async function getMfaStatus(adminId: string): Promise<{ enabled: boolean }> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true } });
  return { enabled: Boolean(admin?.totpEnabledAt) };
}

/** Generate a fresh (pending) secret and return provisioning info, or null. */
export async function beginMfaEnrollment(adminId: string): Promise<{ secret: string; uri: string } | null> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin || admin.totpEnabledAt) return null; // unknown admin, or already enabled
  const secret = generateTotpSecret();
  await prisma.admin.update({ where: { id: adminId }, data: { totpSecret: secret, totpEnabledAt: null } });
  return { secret, uri: totpAuthUri({ secret, account: admin.email ?? admin.username, issuer: ISSUER }) };
}

/**
 * Confirm a code against the pending secret and activate MFA. Requires the
 * current password (P2-2) so a stolen session cannot complete enrollment.
 */
export async function confirmMfaEnrollment(adminId: string, password: string, token: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin?.totpSecret || admin.totpEnabledAt) return false;
  if (!(await verifyPassword(password, admin.hashedPassword))) return false;
  if (!verifyTotp(admin.totpSecret, token)) return false;
  await prisma.admin.update({ where: { id: adminId }, data: { totpEnabledAt: new Date() } });
  return true;
}

/** Disable MFA — requires the current password AND a valid code. */
export async function disableMfa(adminId: string, password: string, token: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin?.totpEnabledAt || !admin.totpSecret) return false;
  if (!(await verifyPassword(password, admin.hashedPassword))) return false;
  if (!verifyTotp(admin.totpSecret, token)) return false;
  await prisma.admin.update({ where: { id: adminId }, data: { totpSecret: null, totpEnabledAt: null } });
  return true;
}
