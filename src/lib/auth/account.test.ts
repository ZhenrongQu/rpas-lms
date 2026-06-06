import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";

describe("auth account persistence", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("stores a free user with optional email, phone, username, and identities", async () => {
    const user = await prisma.user.create({
      data: {
        username: "pilot-one",
        email: "pilot@example.com",
        phone: "+16045551234",
        displayName: "Pilot One",
        emailVerifiedAt: new Date("2026-06-06T00:00:00.000Z"),
        phoneVerifiedAt: new Date("2026-06-06T00:00:00.000Z"),
        identities: {
          create: {
            provider: "email",
            providerAccountId: "pilot@example.com",
            verifiedAt: new Date("2026-06-06T00:00:00.000Z"),
          },
        },
      },
      include: { identities: true },
    });

    expect(user.accessTier).toBe("FREE");
    expect(user.username).toBe("pilot-one");
    expect(user.identities).toHaveLength(1);
    expect(user.identities[0].provider).toBe("email");
  });
});
