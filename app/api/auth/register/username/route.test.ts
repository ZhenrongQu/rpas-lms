import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { POST as requestCode } from "../../code/request/route";
import { GET as checkUsername } from "../../username/check/route";
import { POST as registerUsername } from "./route";

describe("username registration routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("checks username availability", async () => {
    const available = await checkUsername(
      new Request("http://test/api/auth/username/check?username=pilotone"),
    );
    expect(await available.json()).toEqual({ available: true });

    await prisma.user.create({ data: { username: "pilotone", accessTier: "FREE" } });

    const taken = await checkUsername(
      new Request("http://test/api/auth/username/check?username=pilotone"),
    );
    expect(await taken.json()).toEqual({ available: false });
  });

  it("creates a username user after email code verification", async () => {
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

    const res = await registerUsername(
      new Request("http://test/api/auth/register/username", {
        method: "POST",
        body: JSON.stringify({
          username: "pilotone",
          channel: "email",
          target: "pilot@example.com",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("pilotone");
    expect(body.user.email).toBe("pilot@example.com");
    expect(body.user.accessTier).toBe("FREE");
  });
});
