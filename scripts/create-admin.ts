/**
 * Create (or update) an admin in the dedicated `Admin` table.
 *
 * Usage:
 *   ADMIN_USERNAME=yourname ADMIN_PASSWORD='your-strong-pw' \
 *     [ADMIN_EMAIL=you@example.com] pnpm exec tsx scripts/create-admin.ts
 *
 * - Username is required and @unique; normalized to lowercase and validated like
 *   the app's login (^[a-z0-9]{6,24}$). Admins sign in with username or email.
 * - Email (optional) is normalized (trim + lowercase).
 * - Password is bcrypt-hashed (same cost as the app's auth path).
 * - Idempotent on username: re-running resets the password (and email).
 *
 * Admins are physically separate from customers — there is no `role` field and
 * no customer/learning data on this record.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const rawUsername = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const rawEmail = process.env.ADMIN_EMAIL;

  if (!rawUsername || !password) {
    throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD env vars.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const username = rawUsername.trim().toLowerCase();
  if (!/^[a-z0-9]{6,24}$/.test(username)) {
    throw new Error("ADMIN_USERNAME must be 6-24 lowercase alphanumeric chars.");
  }
  const email = rawEmail ? rawEmail.trim().toLowerCase() : undefined;
  const hashedPassword = await bcrypt.hash(password, 10);

  const existing = await prisma.admin.findUnique({ where: { username } });

  const admin = await prisma.admin.upsert({
    where: { username },
    update: { hashedPassword, ...(email ? { email } : {}) },
    create: { username, hashedPassword, ...(email ? { email } : {}) },
  });

  console.log(
    `✓ ${existing ? "Updated" : "Created"} admin  id=${admin.id}  ${admin.username}${admin.email ? `  ${admin.email}` : ""}`,
  );
}

main()
  .catch((err) => {
    console.error("✗", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
