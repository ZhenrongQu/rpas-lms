import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  bearerToken,
  createMobileSession,
  hashMobileToken,
  type MobileAccount,
  readMobileSession,
  revokeMobileSession,
} from "./session";
import { prisma } from "../db";

vi.mock("../db", () => ({
  prisma: {
    mobileSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("mobile sessions", () => {
  it("exposes only free or paid mobile access tiers", () => {
    expectTypeOf<MobileAccount["accessTier"]>().toEqualTypeOf<"FREE" | "PAID">();
  });

  it("hashes tokens with sha256 hex", () => {
    expect(hashMobileToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("creates an opaque token and stores only its hash", async () => {
    vi.mocked(prisma.mobileSession.create).mockResolvedValue({ id: "ms_1" } as never);
    const now = new Date("2026-06-24T00:00:00.000Z");

    const session = await createMobileSession({
      userId: "user_1",
      now: () => now,
      tokenFactory: () => "plain-token",
    });

    expect(session).toEqual({
      token: "plain-token",
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    });
    expect(prisma.mobileSession.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashMobileToken("plain-token"),
        userId: "user_1",
        expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      },
    });
  });

  it("returns null for missing, expired, or revoked sessions", async () => {
    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce(null);
    await expect(readMobileSession("missing", () => new Date())).resolves.toBeNull();

    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_1",
      userId: "user_1",
      tokenHash: hashMobileToken("expired"),
      expiresAt: new Date("2026-06-23T00:00:00.000Z"),
      revokedAt: null,
      user: { id: "user_1", email: "a@test.com", displayName: null, accessTier: "FREE" },
    } as never);
    await expect(readMobileSession("expired", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toBeNull();

    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_2",
      userId: "user_1",
      tokenHash: hashMobileToken("revoked"),
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      revokedAt: new Date("2026-06-24T00:00:00.000Z"),
      user: { id: "user_1", email: "a@test.com", displayName: null, accessTier: "FREE" },
    } as never);
    await expect(readMobileSession("revoked", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toBeNull();
  });

  it("returns the active user for a valid session", async () => {
    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_1",
      userId: "user_1",
      tokenHash: hashMobileToken("active"),
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      revokedAt: null,
      user: { id: "user_1", email: "a@test.com", displayName: "A", accessTier: "PAID" },
    } as never);

    await expect(readMobileSession("active", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toEqual({
      userId: "user_1",
      email: "a@test.com",
      name: "A",
      accessTier: "PAID",
    });
  });

  it("revokes a token by hash", async () => {
    await revokeMobileSession("plain", () => new Date("2026-06-24T00:00:00.000Z"));
    expect(prisma.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashMobileToken("plain"), revokedAt: null },
      data: { revokedAt: new Date("2026-06-24T00:00:00.000Z") },
    });
  });

  it("parses bearer tokens", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer abc" }))).toBe("abc");
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
