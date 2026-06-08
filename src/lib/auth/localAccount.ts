import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { normalizeTarget, verifyCode } from "./verificationCode";

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
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
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
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail?.emailVerifiedAt && existingEmail.id !== currentUserId) {
    throw new Error("email_already_registered");
  }

  if (username) {
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername && existingUsername.id !== currentUserId) {
      throw new Error("username_unavailable");
    }
  }

  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone && existingPhone.id !== currentUserId) {
      throw new Error("phone_unavailable");
    }
  }
}

export async function registerLocalAccount(input: RegisterLocalAccountInput) {
  const email = normalizeEmail(input.email);
  const username = input.username ? normalizeUsername(input.username) : undefined;
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const existingPendingUser = await prisma.user.findUnique({ where: { email } });

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
    return prisma.user.update({
      where: { id: existingPendingUser.id },
      data,
    });
  }

  return prisma.user.create({
    data: {
      ...data,
      email,
    },
  });
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
    await prisma.user.update({
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

export async function authorizeLocalPasswordLogin(input: LoginInput) {
  if (!input.password) return null;
  const identifier = selectedIdentifier(input);
  if (!identifier) return null;

  const user =
    identifier.kind === "email"
      ? await prisma.user.findUnique({ where: { email: identifier.value } })
      : identifier.kind === "phone"
        ? await prisma.user.findUnique({ where: { phone: identifier.value } })
        : await prisma.user.findUnique({ where: { username: identifier.value } });
  if (!user?.hashedPassword || !user.emailVerifiedAt) return null;

  const ok = await verifyPassword(input.password, user.hashedPassword);
  return ok ? user : null;
}
