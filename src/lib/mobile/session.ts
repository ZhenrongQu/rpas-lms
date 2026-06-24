import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";

const MOBILE_SESSION_DAYS = 30;

export type MobileAccessTier = "FREE" | "PAID";

export type MobileAccount = {
  userId: string;
  email: string | null;
  name: string | null;
  accessTier: MobileAccessTier;
};

export function hashMobileToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createMobileSession({
  userId,
  now = () => new Date(),
  tokenFactory = () => randomBytes(32).toString("base64url"),
}: {
  userId: string;
  now?: () => Date;
  tokenFactory?: () => string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = tokenFactory();
  const expiresAt = addDays(now(), MOBILE_SESSION_DAYS);

  await prisma.mobileSession.create({
    data: {
      tokenHash: hashMobileToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function readMobileSession(
  token: string,
  now: () => Date = () => new Date(),
): Promise<MobileAccount | null> {
  const row = await prisma.mobileSession.findUnique({
    where: { tokenHash: hashMobileToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          accessTier: true,
        },
      },
    },
  });

  if (!row || row.revokedAt || row.expiresAt <= now()) return null;

  return {
    userId: row.user.id,
    email: row.user.email,
    name: row.user.displayName,
    accessTier: row.user.accessTier === "PAID" ? "PAID" : "FREE",
  };
}

export async function revokeMobileSession(
  token: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  await prisma.mobileSession.updateMany({
    where: { tokenHash: hashMobileToken(token), revokedAt: null },
    data: { revokedAt: now() },
  });
}

export function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const firstSpace = header.indexOf(" ");
  if (firstSpace < 0) return null;

  const scheme = header.slice(0, firstSpace);
  if (scheme.toLowerCase() !== "bearer") return null;

  const token = header.slice(firstSpace + 1).trim();
  return token ? token : null;
}
