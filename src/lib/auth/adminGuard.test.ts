import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db";

// Mock ONLY the NextAuth session source; the Admin-row lookup hits the real test
// DB. `vi.hoisted` lets the factory reference the spy despite vi.mock hoisting.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../auth", () => ({ auth: authMock }));

import { getCurrentAdmin, requireAdminApi } from "./adminGuard";

describe("admin session guard", () => {
  let adminId: string;
  let customerId: string;

  beforeEach(async () => {
    await prisma.admin.deleteMany();
    await prisma.customer.deleteMany();
    const admin = await prisma.admin.create({
      data: { username: "guard-admin", hashedPassword: "x" },
    });
    adminId = admin.id;
    const customer = await prisma.customer.create({
      data: { username: "guard-customer", hashedPassword: "x" },
    });
    customerId = customer.id;
    authMock.mockReset();
  });

  afterEach(() => authMock.mockReset());

  afterAll(async () => {
    await prisma.admin.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$disconnect();
  });

  it("returns the admin for an admin session backed by an Admin row", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, isAdmin: true } });
    expect(await getCurrentAdmin()).toEqual({ id: adminId });
  });

  it("rejects when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("rejects a session not flagged isAdmin, even with a valid Admin id", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, isAdmin: false } });
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("CRITICAL: rejects a customer id even if the session forges isAdmin:true", async () => {
    // The decisive check: isAdmin alone is not enough — the id must exist in Admin.
    authMock.mockResolvedValue({ user: { id: customerId, isAdmin: true } });
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("requireAdminApi: null for an admin, 404 Response for a non-admin", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, isAdmin: true } });
    expect(await requireAdminApi()).toBeNull();

    authMock.mockResolvedValue({ user: { id: customerId, isAdmin: true } });
    const denied = await requireAdminApi();
    expect(denied).toBeInstanceOf(Response);
    expect(denied?.status).toBe(404);
  });
});
