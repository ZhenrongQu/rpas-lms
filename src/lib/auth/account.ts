import { prisma } from "../db";
import type { AuthProvider, VerificationChannel } from "./types";
import { normalizeTarget } from "./verificationCode";

function assertUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new Error("invalid_username");
  }
  return normalized;
}

function providerForChannel(channel: VerificationChannel): "email" | "phone" {
  return channel === "email" ? "email" : "phone";
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const normalized = assertUsername(username);
  const existing = await prisma.user.findUnique({
    where: { username: normalized },
    select: { id: true },
  });
  return !existing;
}

export async function createOrLoginVerifiedContactUser({
  channel,
  target,
  now = () => new Date(),
}: {
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
}) {
  const normalized = normalizeTarget(channel, target);
  const provider = providerForChannel(channel);
  const verifiedAt = now();

  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: normalized,
      },
    },
    include: { user: true },
  });
  if (existingIdentity) return existingIdentity.user;

  const existingUser =
    channel === "email"
      ? await prisma.user.findUnique({ where: { email: normalized } })
      : await prisma.user.findUnique({ where: { phone: normalized } });

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerifiedAt:
          channel === "email"
            ? existingUser.emailVerifiedAt ?? verifiedAt
            : existingUser.emailVerifiedAt,
        phoneVerifiedAt:
          channel === "sms"
            ? existingUser.phoneVerifiedAt ?? verifiedAt
            : existingUser.phoneVerifiedAt,
        identities: {
          create: { provider, providerAccountId: normalized, verifiedAt },
        },
      },
    });
  }

  return prisma.user.create({
    data: {
      email: channel === "email" ? normalized : undefined,
      phone: channel === "sms" ? normalized : undefined,
      emailVerifiedAt: channel === "email" ? verifiedAt : undefined,
      phoneVerifiedAt: channel === "sms" ? verifiedAt : undefined,
      accessTier: "FREE",
      identities: {
        create: { provider, providerAccountId: normalized, verifiedAt },
      },
    },
  });
}

export async function createUsernameUser({
  username,
  channel,
  target,
  now = () => new Date(),
}: {
  username: string;
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
}) {
  const normalizedUsername = assertUsername(username);
  const user = await createOrLoginVerifiedContactUser({ channel, target, now });
  const verifiedAt = now();

  return prisma.user.update({
    where: { id: user.id },
    data: {
      username: normalizedUsername,
      identities: {
        create: {
          provider: "username",
          providerAccountId: normalizedUsername,
          verifiedAt,
        },
      },
    },
  });
}

export async function assignUsernameToUser({
  userId,
  username,
  now = () => new Date(),
}: {
  userId: string;
  username: string;
  now?: () => Date;
}) {
  const normalizedUsername = assertUsername(username);

  return prisma.user.update({
    where: { id: userId },
    data: {
      username: normalizedUsername,
      identities: {
        create: {
          provider: "username",
          providerAccountId: normalizedUsername,
          verifiedAt: now(),
        },
      },
    },
  });
}

export async function findOrCreateOAuthUser({
  provider,
  providerAccountId,
  email,
  emailVerified,
  displayName,
  now = () => new Date(),
}: {
  provider: Extract<AuthProvider, "google" | "apple">;
  providerAccountId: string;
  email?: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  now?: () => Date;
}) {
  const existingIdentity = await prisma.userIdentity.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true },
  });
  if (existingIdentity) return existingIdentity.user;

  const normalizedEmail = email ? normalizeTarget("email", email) : null;
  const verifiedAt = now();
  const existingUser = normalizedEmail && emailVerified
    ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
    : null;

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: existingUser.displayName ?? displayName ?? undefined,
        emailVerifiedAt:
          emailVerified && normalizedEmail
            ? existingUser.emailVerifiedAt ?? verifiedAt
            : existingUser.emailVerifiedAt,
        identities: {
          create: {
            provider,
            providerAccountId,
            verifiedAt: emailVerified ? verifiedAt : null,
          },
        },
      },
    });
  }

  return prisma.user.create({
    data: {
      email: emailVerified ? normalizedEmail ?? undefined : undefined,
      displayName: displayName ?? undefined,
      emailVerifiedAt: emailVerified && normalizedEmail ? verifiedAt : undefined,
      accessTier: "FREE",
      identities: {
        create: {
          provider,
          providerAccountId,
          verifiedAt: emailVerified ? verifiedAt : null,
        },
      },
    },
  });
}
