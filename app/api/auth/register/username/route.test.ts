import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { GET as checkUsername } from "../../username/check/route";
import { POST as registerUsername } from "./route";

describe("username auth routes", () => {
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

  it("does not allow standalone username registration", async () => {
    const res = await registerUsername(
      new Request("http://test/api/auth/register/username", {
        method: "POST",
        body: JSON.stringify({ username: "pilotone" }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "username registration disabled" });
  });
});
