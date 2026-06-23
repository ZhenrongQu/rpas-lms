import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { authorizeAdminPasswordLogin } from "./adminAccount";
import { authorizeLocalPasswordLogin } from "./localAccount";
import { hashPassword } from "./password";

// SEC-10: an account must lock after repeated failed logins so that even the
// correct password is rejected until the window elapses.

const EMAIL = "lockout-test@rpas.test";
const ADMIN_USER = "lockout-admin";
const PASSWORD = "correct-horse-battery";
const at = (ms: number) => () => new Date(ms);

async function cleanup() {
  await prisma.customer.deleteMany({ where: { email: EMAIL } });
  await prisma.admin.deleteMany({ where: { username: ADMIN_USER } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: EMAIL } } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: ADMIN_USER } } });
}

describe("login lockout (SEC-10)", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("locks a customer after repeated failures, rejecting even the right password until recovery", async () => {
    const hashedPassword = await hashPassword(PASSWORD);
    await prisma.customer.create({
      data: { email: EMAIL, hashedPassword, emailVerifiedAt: new Date(), accessTier: "FREE" },
    });

    const now = at(1_000_000);
    // Hammer with wrong passwords until the lock trips (limit 8 → 9 failures).
    for (let i = 0; i < 9; i++) {
      expect(await authorizeLocalPasswordLogin({ email: EMAIL, password: "wrong" }, now)).toBeNull();
    }

    // Correct password is now rejected because the account is locked.
    expect(await authorizeLocalPasswordLogin({ email: EMAIL, password: PASSWORD }, now)).toBeNull();

    // After the 15-minute window, the correct password works again.
    const later = at(1_000_000 + 16 * 60 * 1000);
    const user = await authorizeLocalPasswordLogin({ email: EMAIL, password: PASSWORD }, later);
    expect(user?.email).toBe(EMAIL);
  });

  it("locks an admin after fewer failures (5 → 6 failures)", async () => {
    const hashedPassword = await hashPassword(PASSWORD);
    await prisma.admin.create({ data: { username: ADMIN_USER, hashedPassword } });

    const now = at(2_000_000);
    for (let i = 0; i < 6; i++) {
      expect(await authorizeAdminPasswordLogin({ username: ADMIN_USER, password: "wrong" }, now)).toBeNull();
    }
    // Locked: correct password rejected.
    expect(await authorizeAdminPasswordLogin({ username: ADMIN_USER, password: PASSWORD }, now)).toBeNull();

    // Recovers after the 30-minute admin block.
    const later = at(2_000_000 + 31 * 60 * 1000);
    const admin = await authorizeAdminPasswordLogin({ username: ADMIN_USER, password: PASSWORD }, later);
    expect(admin?.username).toBe(ADMIN_USER);
  });
});
