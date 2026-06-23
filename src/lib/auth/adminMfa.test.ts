import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { authorizeAdminPasswordLogin } from "./adminAccount";
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa, getMfaStatus } from "./adminMfa";
import { hashPassword } from "./password";
import { generateTotp, generateTotpSecret } from "./totp";

// SEC-16: admin MFA — enrollment lifecycle and login enforcement.

const USER = "mfa-admin";
const PASSWORD = "correct-horse-battery";

async function cleanup() {
  await prisma.admin.deleteMany({ where: { username: USER } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: USER } } });
}

async function makeAdmin(extra: Record<string, unknown> = {}) {
  const hashedPassword = await hashPassword(PASSWORD);
  return prisma.admin.create({ data: { username: USER, hashedPassword, ...extra } });
}

describe("admin MFA (SEC-16)", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("enrolls: begin → confirm enables, status reflects it", async () => {
    const admin = await makeAdmin();
    expect((await getMfaStatus(admin.id)).enabled).toBe(false);

    const started = await beginMfaEnrollment(admin.id);
    expect(started?.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect((await getMfaStatus(admin.id)).enabled).toBe(false); // pending, not yet active

    // P2-2: confirm requires the current password AND a valid code.
    expect(await confirmMfaEnrollment(admin.id, PASSWORD, "000000")).toBe(false); // wrong code
    expect(await confirmMfaEnrollment(admin.id, "wrong-pass", generateTotp(started!.secret))).toBe(false); // wrong password
    expect((await getMfaStatus(admin.id)).enabled).toBe(false); // still not enabled
    expect(await confirmMfaEnrollment(admin.id, PASSWORD, generateTotp(started!.secret))).toBe(true);
    expect((await getMfaStatus(admin.id)).enabled).toBe(true);
  });

  it("requires the TOTP code at login once enabled", async () => {
    const secret = generateTotpSecret();
    const admin = await makeAdmin({ totpSecret: secret, totpEnabledAt: new Date() });

    // Right password, no/!wrong code → rejected.
    expect(await authorizeAdminPasswordLogin({ username: USER, password: PASSWORD })).toBeNull();
    expect(await authorizeAdminPasswordLogin({ username: USER, password: PASSWORD, totp: "000000" })).toBeNull();

    // Right password + valid code → authorized.
    const okAdmin = await authorizeAdminPasswordLogin({ username: USER, password: PASSWORD, totp: generateTotp(secret) });
    expect(okAdmin?.id).toBe(admin.id);
  });

  it("disable requires password AND a valid code", async () => {
    const secret = generateTotpSecret();
    const admin = await makeAdmin({ totpSecret: secret, totpEnabledAt: new Date() });

    expect(await disableMfa(admin.id, "wrong-pass", generateTotp(secret))).toBe(false);
    expect(await disableMfa(admin.id, PASSWORD, "000000")).toBe(false);
    expect(await disableMfa(admin.id, PASSWORD, generateTotp(secret))).toBe(true);
    expect((await getMfaStatus(admin.id)).enabled).toBe(false);
  });
});
