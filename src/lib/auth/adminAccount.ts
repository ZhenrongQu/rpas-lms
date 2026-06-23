import { prisma } from "../db";
import { clearRateLimit, hitRateLimit, isLocked } from "../security/rateLimit";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";

type AdminLoginInput = {
  email?: string;
  username?: string;
  phone?: string;
  password?: string;
  totp?: string;
  ip?: string;
};

// SEC-10: admins hold the highest privilege, so they lock out faster than
// customers (5 failures vs 8) and stay locked for longer.
const ADMIN_MAX_FAILURES = 5;
const ADMIN_WINDOW_SEC = 15 * 60;
const ADMIN_BLOCK_SEC = 30 * 60;

/**
 * Authorizes an admin against the `Admin` table (physically separate from
 * customers). Admins sign in with a username or email; there is no `role` field
 * anywhere, so a customer can never satisfy this check.
 */
export async function authorizeAdminPasswordLogin(
  input: AdminLoginInput,
  now: () => Date = () => new Date(),
) {
  if (!input.password) return null;
  const identifier = input.email ?? input.username ?? input.phone;
  if (!identifier) return null;
  const normalized = identifier.trim().toLowerCase();

  const acctKey = `login:admin:${normalized}`;
  const ipKey = input.ip ? `login:adminip:${input.ip}` : null;
  if (!(await isLocked(acctKey, now)).allowed) return null;
  if (ipKey && !(await isLocked(ipKey, now)).allowed) return null;

  const limitArgs = { limit: ADMIN_MAX_FAILURES, windowSec: ADMIN_WINDOW_SEC, blockSec: ADMIN_BLOCK_SEC, now };
  const recordFailure = async () => {
    await hitRateLimit({ key: acctKey, ...limitArgs });
    if (ipKey) await hitRateLimit({ key: ipKey, ...limitArgs });
  };

  const admin = await prisma.admin.findFirst({
    where: { OR: [{ username: normalized }, { email: normalized }] },
  });
  if (!admin?.hashedPassword) {
    await recordFailure();
    return null;
  }

  const ok = await verifyPassword(input.password, admin.hashedPassword);
  if (!ok) {
    await recordFailure();
    return null;
  }

  // SEC-16: when MFA is enabled the password alone is not enough — a valid TOTP
  // code is required. A wrong/missing code is a failed login (counts to lockout).
  if (admin.totpEnabledAt) {
    if (!admin.totpSecret || !input.totp || !verifyTotp(admin.totpSecret, input.totp)) {
      await recordFailure();
      return null;
    }
  }

  await clearRateLimit(acctKey);
  if (ipKey) await clearRateLimit(ipKey);
  return admin;
}
