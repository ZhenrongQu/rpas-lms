import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as requestCode } from "./request/route";
import { POST as verifyCodeRoute } from "./verify/route";

async function body(res: Response) {
  return { status: res.status, json: await res.json() };
}

describe("verification code routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("requests an email code without returning the code", async () => {
    const res = await requestCode(
      new Request("http://test/api/auth/code/request", {
        method: "POST",
        body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
      }),
    );

    const result = await body(res);
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });

    const code = await prisma.verificationCode.findFirstOrThrow({
      where: { channel: "email", target: "pilot@example.com" },
    });
    expect(code.codeHash).toBeTruthy();
  });

  it("verifies a code and creates a free user", async () => {
    await requestCode(
      new Request("http://test/api/auth/code/request", {
        method: "POST",
        body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
      }),
    );
    const row = await prisma.verificationCode.findFirstOrThrow();
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { codeHash: await bcrypt.hash("123456", 10) },
    });

    const res = await verifyCodeRoute(
      new Request("http://test/api/auth/code/verify", {
        method: "POST",
        body: JSON.stringify({
          channel: "email",
          target: "pilot@example.com",
          code: "123456",
        }),
      }),
    );

    const result = await body(res);
    expect(result.status).toBe(200);
    expect(result.json.user.accessTier).toBe("FREE");
    expect(result.json.user.email).toBe("pilot@example.com");
  });

  it("rejects invalid payloads", async () => {
    const res = await requestCode(
      new Request("http://test/api/auth/code/request", {
        method: "POST",
        body: JSON.stringify({ channel: "fax", target: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
