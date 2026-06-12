import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  createOrLoginVerifiedContactUser,
  createUsernameUser,
  findOrCreateOAuthUser,
  isUsernameAvailable,
} from "./account";

describe("auth account persistence", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.$disconnect();
  });

  it("stores a free user with optional email, phone, username, and identities", async () => {
    const user = await prisma.customer.create({
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
    expect(user.email).toBe("pilot@example.com");
    expect(user.phone).toBe("+16045551234");
    expect(user.displayName).toBe("Pilot One");
    expect(user.emailVerifiedAt?.toISOString()).toBe("2026-06-06T00:00:00.000Z");
    expect(user.phoneVerifiedAt?.toISOString()).toBe("2026-06-06T00:00:00.000Z");
    expect(user.identities).toHaveLength(1);
    expect(user.identities[0].provider).toBe("email");
  });
});

describe("auth account service", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("creates a free email user and email identity", async () => {
    const user = await createOrLoginVerifiedContactUser({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(user.accessTier).toBe("FREE");
    expect(user.email).toBe("pilot@example.com");
    expect(user.emailVerifiedAt).not.toBeNull();

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "email",
          providerAccountId: "pilot@example.com",
        },
      },
    });
    expect(identity?.userId).toBe(user.id);
  });

  it("creates a username user only with a verified contact", async () => {
    const user = await createUsernameUser({
      username: "pilotone",
      channel: "sms",
      target: "+16045551234",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(user.username).toBe("pilotone");
    expect(user.phone).toBe("+16045551234");
    expect(user.phoneVerifiedAt).not.toBeNull();
  });

  it("reports username availability", async () => {
    expect(await isUsernameAvailable("pilotone")).toBe(true);
    await createUsernameUser({
      username: "pilotone",
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });
    expect(await isUsernameAvailable("pilotone")).toBe(false);
  });

  it("links OAuth identity to an existing verified email user", async () => {
    const emailUser = await createOrLoginVerifiedContactUser({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    const oauthUser = await findOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-123",
      email: "pilot@example.com",
      emailVerified: true,
      displayName: "Pilot",
      now: () => new Date("2026-06-06T00:01:00.000Z"),
    });

    expect(oauthUser.id).toBe(emailUser.id);
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "google-123",
        },
      },
    });
    expect(identity?.userId).toBe(emailUser.id);
  });

  it("does not link OAuth identity to an existing user when provider email is unverified", async () => {
    const emailUser = await createOrLoginVerifiedContactUser({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    const oauthUser = await findOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-unverified",
      email: "pilot@example.com",
      emailVerified: false,
      displayName: "Pilot",
      now: () => new Date("2026-06-06T00:01:00.000Z"),
    });

    expect(oauthUser.id).not.toBe(emailUser.id);
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "google-unverified",
        },
      },
    });
    expect(identity?.userId).toBe(oauthUser.id);
  });

  it("creates separate OAuth identities for google and apple", async () => {
    const google = await findOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-1",
      email: "pilot@example.com",
      emailVerified: true,
      displayName: "Pilot",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    const apple = await findOrCreateOAuthUser({
      provider: "apple",
      providerAccountId: "apple-1",
      email: "pilot@example.com",
      emailVerified: true,
      displayName: "Pilot",
      now: () => new Date("2026-06-06T00:01:00.000Z"),
    });

    expect(apple.id).toBe(google.id);
    const identities = await prisma.userIdentity.findMany({
      where: { userId: google.id },
      orderBy: { provider: "asc" },
    });
    expect(identities.map((identity) => identity.provider)).toEqual(["apple", "google"]);
  });
});
