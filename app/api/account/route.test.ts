import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../src/lib/db";

// Mock only the NextAuth session source; the deletion hits the real DB so the
// cascade behaviour is exercised for real.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../auth", () => ({ auth: authMock }));

import { DELETE } from "./route";

const USER = "delete-acct-user";

async function cleanup() {
  await prisma.customer.deleteMany({ where: { id: USER } });
}

describe("DELETE /api/account (delete account)", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await cleanup();
    await prisma.customer.create({
      data: {
        id: USER,
        username: "delete-acct-user",
        accessTier: "PAID",
        entitlements: { create: { product: "paid_access", source: "test" } },
      },
    });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("401 when not signed in (account untouched)", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
    expect(await prisma.customer.findUnique({ where: { id: USER } })).not.toBeNull();
  });

  it("deletes the account and cascades its entitlement", async () => {
    authMock.mockResolvedValue({ user: { id: USER } });
    const res = await DELETE();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(await prisma.customer.findUnique({ where: { id: USER } })).toBeNull();
    expect(await prisma.entitlement.findFirst({ where: { userId: USER } })).toBeNull();
  });
});
