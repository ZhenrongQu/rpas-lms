import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { requestVerificationCode } from "./verificationCode";
import {
  authorizeLocalPasswordLogin,
  registerLocalAccount,
  verifyRegistrationEmail,
} from "./localAccount";

describe("local password accounts", () => {
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

  it("registers a pending user with a hashed password and optional aliases", async () => {
    const user = await registerLocalAccount({
      email: " Pilot@Example.COM ",
      password: "correct-password",
      username: "PilotOne",
      phone: "(604) 555-1234",
    });

    expect(user.email).toBe("pilot@example.com");
    expect(user.username).toBe("pilotone");
    expect(user.phone).toBe("+16045551234");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.hashedPassword).not.toBe("correct-password");
    expect(await bcrypt.compare("correct-password", user.hashedPassword ?? "")).toBe(true);
  });

  it("rejects duplicate verified emails, usernames, and phones", async () => {
    await prisma.customer.create({
      data: {
        email: "taken@example.com",
        username: "takenname",
        phone: "+16045550000",
        hashedPassword: "hash",
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "FREE",
      },
    });

    await expect(
      registerLocalAccount({ email: "taken@example.com", password: "correct-password" }),
    ).rejects.toThrow("email_already_registered");

    await expect(
      registerLocalAccount({
        email: "new@example.com",
        password: "correct-password",
        username: "takenname",
      }),
    ).rejects.toThrow("username_unavailable");

    await expect(
      registerLocalAccount({
        email: "phone@example.com",
        password: "correct-password",
        phone: "604-555-0000",
      }),
    ).rejects.toThrow("phone_unavailable");
  });

  it("verifies registration email and then allows email, phone, and username login", async () => {
    await registerLocalAccount({
      email: "pilot@example.com",
      password: "correct-password",
      username: "pilotone",
      phone: "+1 604 555 1234",
    });
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      codeFactory: () => "123456",
      now: () => new Date("2026-06-08T00:00:00.000Z"),
    });

    const beforeVerify = await authorizeLocalPasswordLogin({
      email: "pilot@example.com",
      password: "correct-password",
    });
    expect(beforeVerify).toBeNull();

    await expect(
      verifyRegistrationEmail({
        email: "pilot@example.com",
        code: "123456",
        now: () => new Date("2026-06-08T00:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      authorizeLocalPasswordLogin({ email: "pilot@example.com", password: "correct-password" }),
    ).resolves.toMatchObject({ email: "pilot@example.com" });
    await expect(
      authorizeLocalPasswordLogin({ phone: "(604) 555-1234", password: "correct-password" }),
    ).resolves.toMatchObject({ phone: "+16045551234" });
    await expect(
      authorizeLocalPasswordLogin({ username: "PilotOne", password: "correct-password" }),
    ).resolves.toMatchObject({ username: "pilotone" });
  });

  it("rejects password login with zero or multiple identifiers", async () => {
    await expect(authorizeLocalPasswordLogin({ password: "correct-password" })).resolves.toBeNull();
    await expect(
      authorizeLocalPasswordLogin({
        email: "pilot@example.com",
        username: "pilotone",
        password: "correct-password",
      }),
    ).resolves.toBeNull();
  });

  it("rejects wrong passwords for verified local accounts", async () => {
    const user = await registerLocalAccount({
      email: "pilot@example.com",
      password: "correct-password",
    });
    await prisma.customer.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z") },
    });

    await expect(
      authorizeLocalPasswordLogin({
        email: "pilot@example.com",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();
  });
});
