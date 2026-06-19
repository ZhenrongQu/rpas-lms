import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
// NOTE: `prisma.customer` is the former `User` table (renamed in the
// Admin/Customer split). This module only deals with customer (learner) login.
import { prisma } from "../db";
import { clearRateLimit, hitRateLimit, isLocked } from "../security/rateLimit";
import { hashPassword, verifyPassword } from "./password";
import { normalizeTarget, requestVerificationCode, verifyCode } from "./verificationCode";
import { weakPasswordReason } from "./weakPassword";

// SEC-10: lock an account after repeated failed logins so weak passwords can't
// be brute-forced online. Auto-recovers after the window. A per-account lock can
// be abused to deny a known victim service, so the window is short and the
// caller's IP is throttled in parallel (see auth.ts).
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_BLOCK_SEC = 15 * 60;

async function recordLoginFailure(acctKey: string, ipKey: string | null, now: () => Date): Promise<void> {
  await hitRateLimit({ key: acctKey, limit: LOGIN_MAX_FAILURES, windowSec: LOGIN_WINDOW_SEC, blockSec: LOGIN_BLOCK_SEC, now });
  // IP limit is looser than per-account: many users can share one NAT egress IP.
  if (ipKey) {
    await hitRateLimit({ key: ipKey, limit: LOGIN_MAX_FAILURES * 4, windowSec: LOGIN_WINDOW_SEC, blockSec: LOGIN_BLOCK_SEC, now });
  }
}

// Length bounds shared by register / reset / change. The 72-byte ceiling matches
// bcrypt (bytes beyond it are silently ignored, so accepting longer passwords
// would overstate their strength).
function passwordWithinBounds(password: string): boolean {
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

type LocalIdentifier = {
  email?: string;
  phone?: string;
  username?: string;
};

type RegisterLocalAccountInput = {
  email: string;
  password: string;
  phone?: string;
  username?: string;
};

type LoginInput = LocalIdentifier & {
  password?: string;
};

function normalizeEmail(email: string): string {
  return normalizeTarget("email", email);
}

function normalizePhone(phone: string): string {
  return normalizeTarget("sms", phone);
}

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9]{6,24}$/.test(normalized)) {
    throw new Error("invalid_username");
  }
  return normalized;
}

function selectedIdentifier(input: LocalIdentifier):
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "username"; value: string }
  | null {
  const selected: Array<
    | { kind: "email"; value: string }
    | { kind: "phone"; value: string }
    | { kind: "username"; value: string }
  > = [];

  if (input.email) selected.push({ kind: "email", value: normalizeEmail(input.email) });
  if (input.phone) selected.push({ kind: "phone", value: normalizePhone(input.phone) });
  if (input.username) selected.push({ kind: "username", value: normalizeUsername(input.username) });

  return selected.length === 1 ? selected[0] : null;
}

async function assertAliasAvailable({
  email,
  phone,
  username,
  currentUserId,
}: {
  email: string;
  phone?: string;
  username?: string;
  currentUserId?: string;
}) {
  const existingEmail = await prisma.customer.findUnique({ where: { email } });
  if (existingEmail?.emailVerifiedAt && existingEmail.id !== currentUserId) {
    throw new Error("email_already_registered");
  }

  if (username) {
    const existingUsername = await prisma.customer.findUnique({ where: { username } });
    if (existingUsername && existingUsername.id !== currentUserId) {
      throw new Error("username_unavailable");
    }
  }

  if (phone) {
    const existingPhone = await prisma.customer.findUnique({ where: { phone } });
    if (existingPhone && existingPhone.id !== currentUserId) {
      throw new Error("phone_unavailable");
    }
  }
}

export async function registerLocalAccount(input: RegisterLocalAccountInput) {
  // SEC-08: enforce password bounds in the service, not only the route's zod.
  if (!passwordWithinBounds(input.password)) {
    throw new Error("invalid_password");
  }
  // SEC-13: reject common / guessable passwords server-side (client complexity
  // rules are a UX gate and can be bypassed by calling the API directly).
  if (weakPasswordReason(input.password, { email: input.email, username: input.username })) {
    throw new Error("weak_password");
  }
  const email = normalizeEmail(input.email);
  const username = input.username ? normalizeUsername(input.username) : undefined;
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const existingPendingUser = await prisma.customer.findUnique({ where: { email } });

  await assertAliasAvailable({
    email,
    username,
    phone,
    currentUserId: existingPendingUser?.emailVerifiedAt ? undefined : existingPendingUser?.id,
  });

  const hashedPassword = await hashPassword(input.password);
  const data = {
    username: username ?? null,
    phone: phone ?? null,
    hashedPassword,
    accessTier: "FREE",
    emailVerifiedAt: null,
  };

  if (existingPendingUser && !existingPendingUser.emailVerifiedAt) {
    return prisma.customer.update({
      where: { id: existingPendingUser.id },
      data,
    });
  }

  // P2-1: `userNumber` is allocated as max+1, which two concurrent registrations
  // can read identically and collide on its unique index. Retry on that specific
  // conflict with a recomputed number; any other unique violation (e.g. email)
  // is a real error and rethrown.
  for (let attempt = 0; ; attempt++) {
    const maxResult = await prisma.customer.aggregate({ _max: { userNumber: true } });
    const nextUserNumber = (maxResult._max.userNumber ?? 0) + 1;
    try {
      return await prisma.customer.create({ data: { ...data, email, userNumber: nextUserNumber } });
    } catch (error) {
      if (attempt < 5 && isUserNumberConflict(error)) continue;
      throw error;
    }
  }
}

function isUserNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes("userNumber") : String(target ?? "").includes("userNumber");
}

export async function verifyRegistrationEmail({
  email,
  code,
  now = () => new Date(),
}: {
  email: string;
  code: string;
  now?: () => Date;
}): Promise<{ ok: true } | { ok: false; reason: "invalid_or_expired" | "too_many_attempts" }> {
  const normalizedEmail = normalizeEmail(email);
  const verified = await verifyCode({
    channel: "email",
    target: normalizedEmail,
    code,
    now,
  });

  if (!verified.ok) return verified;

  const verifiedAt = now();
  try {
    await prisma.customer.update({
      where: { email: normalizedEmail },
      data: {
        emailVerifiedAt: verifiedAt,
        identities: {
          upsert: {
            where: {
              provider_providerAccountId: {
                provider: "email",
                providerAccountId: normalizedEmail,
              },
            },
            create: {
              provider: "email",
              providerAccountId: normalizedEmail,
              verifiedAt,
            },
            update: { verifiedAt },
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, reason: "invalid_or_expired" };
    }
    throw error;
  }

  return { ok: true };
}

export async function authorizeLocalPasswordLogin(
  input: LoginInput & { ip?: string },
  now: () => Date = () => new Date(),
) {
  if (!input.password) return null;
  const identifier = selectedIdentifier(input);
  if (!identifier) return null;

  const acctKey = `login:acct:${identifier.kind}:${identifier.value}`;
  const ipKey = input.ip ? `login:ip:${input.ip}` : null;

  // SEC-10: reject while locked, before any DB/bcrypt work, so a locked account
  // stays locked even for the correct password until the window elapses.
  if (!(await isLocked(acctKey, now)).allowed) return null;
  if (ipKey && !(await isLocked(ipKey, now)).allowed) return null;

  const user =
    identifier.kind === "email"
      ? await prisma.customer.findUnique({ where: { email: identifier.value } })
      : identifier.kind === "phone"
        ? await prisma.customer.findUnique({ where: { phone: identifier.value } })
        : await prisma.customer.findUnique({ where: { username: identifier.value } });
  if (!user?.hashedPassword || !user.emailVerifiedAt) {
    await recordLoginFailure(acctKey, ipKey, now);
    return null;
  }

  const ok = await verifyPassword(input.password, user.hashedPassword);
  if (!ok) {
    await recordLoginFailure(acctKey, ipKey, now);
    return null;
  }

  await clearRateLimit(acctKey);
  if (ipKey) await clearRateLimit(ipKey);
  return user;
}

// ── Password reset (forgot password) ────────────────────────────────────────

/**
 * Issue a single-use reset token for `email` if a customer with that email
 * exists. Returns the token (to embed in a link) only when an account is found;
 * the caller emails it. Callers MUST respond identically whether or not an
 * account exists, so this never reveals enumeration to the client.
 */
export async function createPasswordResetToken({
  email,
  now = () => new Date(),
}: {
  email: string;
  now?: () => Date;
}): Promise<{ ok: true; token: string; target: string } | { ok: false }> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.customer.findUnique({ where: { email: normalizedEmail } });
  if (!user) return { ok: false };

  // URL-safe, high-entropy token; the table stores only its bcrypt hash.
  const token = randomBytes(32).toString("base64url");
  const requested = await requestVerificationCode({
    channel: "email_reset",
    target: normalizedEmail,
    now,
    codeFactory: () => token,
  });

  return { ok: true, token, target: requested.target };
}

/**
 * Consume a reset token and set a new password. Completing this proves the user
 * controls the inbox, so an unverified email is marked verified.
 */
export async function resetLocalPassword({
  email,
  token,
  newPassword,
  now = () => new Date(),
}: {
  email: string;
  token: string;
  newPassword: string;
  now?: () => Date;
}): Promise<{ ok: true } | { ok: false; reason: "invalid_password" | "invalid_or_expired" | "too_many_attempts" }> {
  if (!passwordWithinBounds(newPassword)) {
    return { ok: false, reason: "invalid_password" };
  }
  const normalizedEmail = normalizeEmail(email);
  const verified = await verifyCode({ channel: "email_reset", target: normalizedEmail, code: token, now });
  if (!verified.ok) return verified;

  const hashedPassword = await hashPassword(newPassword);
  try {
    await prisma.customer.update({
      where: { email: normalizedEmail },
      data: { hashedPassword },
    });
  } catch (error) {
    // Token matched but the account vanished between issue and use.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, reason: "invalid_or_expired" };
    }
    throw error;
  }

  // Mark verified only if it wasn't already (avoid clobbering the original time).
  await prisma.customer.updateMany({
    where: { email: normalizedEmail, emailVerifiedAt: null },
    data: { emailVerifiedAt: now() },
  });

  return { ok: true };
}

// ── Change password (authenticated, from dashboard) ─────────────────────────

export async function changeLocalPassword({
  userId,
  oldPassword,
  newPassword,
}: {
  userId: string;
  oldPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; reason: "no_password_set" | "wrong_password" | "invalid_password" }> {
  if (!passwordWithinBounds(newPassword)) {
    return { ok: false, reason: "invalid_password" };
  }
  const user = await prisma.customer.findUnique({ where: { id: userId } });
  if (!user?.hashedPassword) return { ok: false, reason: "no_password_set" };

  const ok = await verifyPassword(oldPassword, user.hashedPassword);
  if (!ok) return { ok: false, reason: "wrong_password" };

  const hashedPassword = await hashPassword(newPassword);
  await prisma.customer.update({ where: { id: userId }, data: { hashedPassword } });
  return { ok: true };
}
