import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { VerificationChannel, VerificationFailureReason } from "./types";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizeTarget(channel: VerificationChannel, target: string): string {
  const trimmed = target.trim();

  if (channel === "email") {
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
  const codeHash = await bcrypt.hash(code, 10);

  await prisma.verificationCode.updateMany({
    where: {
      channel,
      target: normalizedTarget,
      consumedAt: null,
    },
    data: { consumedAt: createdAt },
  });

  const row = await prisma.verificationCode.create({
    data: {
      channel,
      target: normalizedTarget,
      codeHash,
      expiresAt: new Date(createdAt.getTime() + CODE_TTL_MS),
    },
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
    const attempts = row.attempts + 1;

    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { attempts },
    });

    return {
      ok: false,
      reason: attempts >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid_or_expired",
    };
  }

  await prisma.verificationCode.update({
    where: { id: row.id },
    data: { consumedAt: currentTime },
  });

  return { ok: true, target: normalizedTarget };
}
