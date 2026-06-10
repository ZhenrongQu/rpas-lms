/**
 * Create (or promote) an ADMIN user.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-strong-pw' \
 *     [ADMIN_USERNAME=yourname] pnpm exec tsx scripts/create-admin.ts
 *
 * - Email is normalized (trim + lowercase).
 * - Username (optional) is normalized to lowercase and validated like the app's
 *   register flow (^[a-z0-9]{6,24}$), so username login matches case-insensitively.
 * - Password is bcrypt-hashed (same cost as the app's auth path).
 * - emailVerifiedAt is set so the account can sign in immediately.
 * - An "email" UserIdentity is upserted to match the normal verified-login shape.
 * - If the email already exists, the user is promoted to ADMIN and the password
 *   is reset to the provided one (idempotent).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const rawEmail = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  let username: string | undefined;
  if (process.env.ADMIN_USERNAME) {
    username = process.env.ADMIN_USERNAME.trim().toLowerCase();
    if (!/^[a-z0-9]{6,24}$/.test(username)) {
      throw new Error("ADMIN_USERNAME must be 6-24 lowercase alphanumeric chars.");
    }
  }

  const email = rawEmail.trim().toLowerCase();
  const hashedPassword = await bcrypt.hash(password, 10);
  const verifiedAt = new Date();

  const existing = await prisma.user.findUnique({ where: { email } });

  const userNumber =
    existing?.userNumber ??
    (await prisma.user.aggregate({ _max: { userNumber: true } }))._max.userNumber ??
    0;
  const nextUserNumber = existing?.userNumber ?? userNumber + 1;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: "ADMIN",
      hashedPassword,
      emailVerifiedAt: verifiedAt,
      ...(username ? { username } : {}),
    },
    create: {
      email,
      userNumber: nextUserNumber,
      role: "ADMIN",
      accessTier: "FREE",
      hashedPassword,
      emailVerifiedAt: verifiedAt,
      ...(username ? { username } : {}),
    },
  });

  await prisma.userIdentity.upsert({
    where: {
      provider_providerAccountId: { provider: "email", providerAccountId: email },
    },
    update: { verifiedAt },
    create: {
      userId: user.id,
      provider: "email",
      providerAccountId: email,
      verifiedAt,
    },
  });

  console.log(
    `✓ ${existing ? "Promoted" : "Created"} ADMIN  id=${user.id}  #${user.userNumber}  ${user.email}`,
  );
}

main()
  .catch((err) => {
    console.error("✗", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
