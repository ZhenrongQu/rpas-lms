import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as register } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(async () => {
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("does not allow legacy password self-registration", async () => {
    const res = await register(req({ email: "a@test.local", password: "hunter2pw", name: "Ada" }));
    expect(res.status).toBe(410);
    const user = await prisma.user.findUnique({ where: { email: "a@test.local" } });
    expect(user).toBeNull();
  });

  it("does not leak whether an email is registered", async () => {
    await prisma.user.create({ data: { email: "dup@test.local", accessTier: "FREE" } });
    const res = await register(req({ email: "dup@test.local", password: "anotherpw" }));
    expect(res.status).toBe(410);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await register(req({ email: "not-an-email", password: "x" }));
    expect(res.status).toBe(400);
  });
});
