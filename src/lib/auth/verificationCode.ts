import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { VerificationChannel, VerificationFailureReason } from "./types";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizeTarget(channel: VerificationChannel, target: string): string {
  const trimmed = target.trim();

  if (channel === "email" || channel === "email_reset") {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length > 0) return `+${digits}`;
  return `+${digits}`;
}

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestVerificationCode({
  channel,
  target,
  now = () => new Date(),
  codeFactory = generateSixDigitCode,
}: {
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
  codeFactory?: () => string;
}): Promise<{ id: string; target: string; code: string }> {
  const normalizedTarget = normalizeTarget(channel, target);
  const createdAt = now();
  const code = codeFactory();
  const codeHash = await bcrypt.hash(code, 10); // slow — hash before taking the lock

  // P3: serialize issuance per (channel, target) with a transaction-scoped
  // advisory lock, so two concurrent requests can't both invalidate the old code
  // and then each insert a new one — which would leave more than one active code
  // and break the "newest code wins" invariant. The lock auto-releases on
  // commit/rollback; hashtext() maps the key to the int the lock API takes (a
  // hash collision merely makes two unrelated targets briefly serialize).
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${channel}:${normalizedTarget}`}))`;
    await tx.verificationCode.updateMany({
      where: { channel, target: normalizedTarget, consumedAt: null },
      data: { consumedAt: createdAt },
    });
    return tx.verificationCode.create({
      data: {
        channel,
        target: normalizedTarget,
        codeHash,
        expiresAt: new Date(createdAt.getTime() + CODE_TTL_MS),
      },
    });
  });

  return {
    id: row.id,
    target: normalizedTarget,
    code,
  };
}

export async function verifyCode({
  channel,
  target,
  code,
  now = () => new Date(),
}: {
  channel: VerificationChannel;
  target: string;
  code: string;
  now?: () => Date;
}): Promise<{ ok: true; target: string } | { ok: false; reason: VerificationFailureReason }> {
  const normalizedTarget = normalizeTarget(channel, target);
  const currentTime = now();

  const row = await prisma.verificationCode.findFirst({
    where: {
      channel,
      target: normalizedTarget,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row || row.expiresAt <= currentTime) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = await bcrypt.compare(code, row.codeHash);
  if (!matches) {
    // P1-4: atomic increment guarded by the same predicates we read on, so
    // concurrent wrong guesses can't both read the old `attempts` and undercount
    // (which would inflate the 5-try cap). The reason text is best-effort.
    await prisma.verificationCode.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: currentTime }, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });

    return {
      ok: false,
      reason: row.attempts + 1 >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid_or_expired",
    };
  }

  // P1-4: consume with a conditional update and check the affected count, so only
  // ONE of several concurrent correct submissions wins — a single-use reset /
  // verification token can't be redeemed twice.
  const consumed = await prisma.verificationCode.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: currentTime }, attempts: { lt: MAX_ATTEMPTS } },
    data: { consumedAt: currentTime },
  });
  if (consumed.count === 0) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  return { ok: true, target: normalizedTarget };
}
