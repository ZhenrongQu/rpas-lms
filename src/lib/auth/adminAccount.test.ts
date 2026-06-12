import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { hashPassword } from "./password";
import { authorizeAdminPasswordLogin } from "./adminAccount";

// The whole point of the Admin/Customer split: admins live in their own table
// with no `role` field, so a customer's credentials can NEVER satisfy the admin
// login path. These tests are the regression guard for that invariant.

const PASSWORD = "admin-secret-password";

async function createAdmin(fields: { username: string; email?: string }) {
  return prisma.admin.create({
    data: {
      username: fields.username,
      ...(fields.email ? { email: fields.email } : {}),
      hashedPassword: await hashPassword(PASSWORD),
    },
  });
}

describe("authorizeAdminPasswordLogin", () => {
  beforeEach(async () => {
    await prisma.admin.deleteMany();
    await prisma.customer.deleteMany();
  });

  afterAll(async () => {
    await prisma.admin.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$disconnect();
  });

  it("authorizes an admin by username and by email (case/space-insensitive)", async () => {
    await createAdmin({ username: "skyadmin", email: "ops@example.com" });

    await expect(
      authorizeAdminPasswordLogin({ username: "  SkyAdmin ", password: PASSWORD }),
    ).resolves.toMatchObject({ username: "skyadmin" });

    await expect(
      authorizeAdminPasswordLogin({ email: "OPS@Example.com", password: PASSWORD }),
    ).resolves.toMatchObject({ username: "skyadmin" });
  });

  it("rejects a wrong password for a real admin", async () => {
    await createAdmin({ username: "skyadmin", email: "ops@example.com" });

    await expect(
      authorizeAdminPasswordLogin({ username: "skyadmin", password: "wrong-password" }),
    ).resolves.toBeNull();
  });

  it("rejects login with no password or no identifier", async () => {
    await createAdmin({ username: "skyadmin" });

    await expect(authorizeAdminPasswordLogin({ username: "skyadmin" })).resolves.toBeNull();
    await expect(authorizeAdminPasswordLogin({ password: PASSWORD })).resolves.toBeNull();
  });

  it("CRITICAL: a customer's credentials can never authenticate as admin", async () => {
    // A fully valid, verified, paid customer who shares an identifier shape with
    // an admin login. There is no Admin row, so every variant must be rejected.
    await prisma.customer.create({
      data: {
        email: "pilot@example.com",
        username: "pilotone",
        hashedPassword: await hashPassword(PASSWORD),
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "PAID",
      },
    });

    await expect(
      authorizeAdminPasswordLogin({ email: "pilot@example.com", password: PASSWORD }),
    ).resolves.toBeNull();
    await expect(
      authorizeAdminPasswordLogin({ username: "pilotone", password: PASSWORD }),
    ).resolves.toBeNull();
  });

  it("does not let a customer shadow a same-named admin with the customer password", async () => {
    // Same username in both tables, DIFFERENT passwords. Only the admin's
    // password may authenticate; the customer's must not.
    await createAdmin({ username: "shared" }); // hashed PASSWORD
    await prisma.customer.create({
      data: { username: "shared", hashedPassword: await hashPassword("customer-only-password") },
    });

    await expect(
      authorizeAdminPasswordLogin({ username: "shared", password: "customer-only-password" }),
    ).resolves.toBeNull();
    await expect(
      authorizeAdminPasswordLogin({ username: "shared", password: PASSWORD }),
    ).resolves.toMatchObject({ username: "shared" });
  });
});
