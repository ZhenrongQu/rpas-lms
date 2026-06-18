import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { hashPassword, verifyPassword } from "../../../../src/lib/auth/password";

// Mock only the NextAuth session source; the customer lookup hits the real DB.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../../auth", () => ({ auth: authMock }));

import { PUT } from "./route";

const USER = "pw-change-user";
const OLD_PW = "Old-Password1";

function req(body: unknown) {
  return new Request("http://test/api/auth/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  await prisma.customer.deleteMany({ where: { id: USER } });
}

describe("PUT /api/auth/password (change password)", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await cleanup();
    await prisma.customer.create({
      data: { id: USER, username: "pw-change-user", hashedPassword: await hashPassword(OLD_PW), accessTier: "FREE" },
    });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("401 when not signed in", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(req({ oldPassword: OLD_PW, newPassword: "New-Password2" }));
    expect(res.status).toBe(401);
  });

  it("403 when the current password is wrong", async () => {
    authMock.mockResolvedValue({ user: { id: USER } });
    const res = await PUT(req({ oldPassword: "not-the-password", newPassword: "New-Password2" }));
    expect(res.status).toBe(403);
  });

  it("updates the password with the correct current password", async () => {
    authMock.mockResolvedValue({ user: { id: USER } });
    const res = await PUT(req({ oldPassword: OLD_PW, newPassword: "New-Password2" }));
    expect(res.status).toBe(200);

    const user = await prisma.customer.findUniqueOrThrow({ where: { id: USER } });
    expect(await verifyPassword("New-Password2", user.hashedPassword!)).toBe(true);
  });
});
