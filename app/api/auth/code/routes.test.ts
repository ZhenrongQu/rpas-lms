import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as requestCode } from "./request/route";
import { POST as verifyCodeRoute } from "./verify/route";

describe("retired public code-login routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("does not allow requesting login codes", async () => {
    const res = await requestCode(
      new Request("http://test/api/auth/code/request", {
        method: "POST",
        body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "code login disabled" });
    expect(await prisma.verificationCode.count()).toBe(0);
  });

  it("does not allow verifying login codes into users", async () => {
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

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "code login disabled" });
    expect(await prisma.user.count()).toBe(0);
  });
});
