/**
 * Create (or update) a customer (learner) in the `Customer` table — handy for
 * local/dev testing without going through the email-verification flow.
 *
 * Usage:
 *   CUSTOMER_EMAIL=you@example.com CUSTOMER_PASSWORD='your-strong-pw' \
 *     [CUSTOMER_USERNAME=yourname] [CUSTOMER_PHONE=+15550001111] \
 *     [CUSTOMER_TIER=FREE|PAID] [CUSTOMER_NAME='Display Name'] \
 *     pnpm exec tsx scripts/create-customer.ts
 *
 * - Email is required, normalized (trim + lowercase), and used as the login id.
 * - Password is bcrypt-hashed (same cost as the app's auth path).
 * - emailVerifiedAt is set so the account can sign in immediately (the login flow
 *   requires a verified email), and an "email" UserIdentity is upserted to match
 *   the normal verified-login shape.
 * - Username (optional) is normalized + validated like the register flow
 *   (^[a-z0-9]{6,24}$); the customer can then log in with email OR username.
 * - Tier defaults to FREE; pass CUSTOMER_TIER=PAID for the paid access tier.
 * - Idempotent on email: re-running resets the password / tier.
 *
 * Reads DATABASE_URL from .env (-> dev DB by default).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const rawEmail = process.env.CUSTOMER_EMAIL;
  const password = process.env.CUSTOMER_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error("Set CUSTOMER_EMAIL and CUSTOMER_PASSWORD env vars.");
  }
  if (password.length < 8) {
    throw new Error("CUSTOMER_PASSWORD must be at least 8 characters.");
  }

  const email = rawEmail.trim().toLowerCase();

  const tier = (process.env.CUSTOMER_TIER ?? "FREE").trim().toUpperCase();
  if (tier !== "FREE" && tier !== "PAID") {
    throw new Error("CUSTOMER_TIER must be FREE or PAID.");
  }

  let username: string | undefined;
  if (process.env.CUSTOMER_USERNAME) {
    username = process.env.CUSTOMER_USERNAME.trim().toLowerCase();
    if (!/^[a-z0-9]{6,24}$/.test(username)) {
      throw new Error("CUSTOMER_USERNAME must be 6-24 lowercase alphanumeric chars.");
    }
  }
  const phone = process.env.CUSTOMER_PHONE?.trim() || undefined;
  const displayName = process.env.CUSTOMER_NAME?.trim() || undefined;

  const hashedPassword = await bcrypt.hash(password, 10);
  const verifiedAt = new Date();

  const existing = await prisma.customer.findUnique({ where: { email } });

  // Assign the next userNumber for brand-new customers (keep it for existing ones).
  let userNumber = existing?.userNumber ?? null;
  if (userNumber == null) {
    const max = (await prisma.customer.aggregate({ _max: { userNumber: true } }))._max.userNumber ?? 0;
    userNumber = max + 1;
  }

  const optional = {
    ...(username ? { username } : {}),
    ...(phone ? { phone } : {}),
    ...(displayName ? { displayName } : {}),
  };

  const customer = await prisma.customer.upsert({
    where: { email },
    update: {
      hashedPassword,
      accessTier: tier,
      emailVerifiedAt: existing?.emailVerifiedAt ?? verifiedAt,
      ...optional,
    },
    create: {
      email,
      userNumber,
      hashedPassword,
      accessTier: tier,
      emailVerifiedAt: verifiedAt,
      ...optional,
    },
  });

  // Email identity to match the normal verified-login shape (idempotent).
  await prisma.userIdentity.upsert({
    where: { provider_providerAccountId: { provider: "email", providerAccountId: email } },
    update: { verifiedAt },
    create: { userId: customer.id, provider: "email", providerAccountId: email, verifiedAt },
  });

  console.log(
    `✓ ${existing ? "Updated" : "Created"} customer  id=${customer.id}  #${customer.userNumber}  ${customer.email}  tier=${customer.accessTier}${customer.username ? `  @${customer.username}` : ""}`,
  );
}

main()
  .catch((err) => {
    console.error("✗", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
