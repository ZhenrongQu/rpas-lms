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
    await prisma.user.deleteMany();
  });
  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a user with a hashed (not plaintext) password", async () => {
    const res = await register(req({ email: "a@test.local", password: "hunter2pw", name: "Ada" }));
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "a@test.local" } });
    expect(user).not.toBeNull();
    expect(user!.hashedPassword).not.toBe("hunter2pw");
    expect(user!.displayName).toBe("Ada");
  });

  it("rejects a duplicate email with 409", async () => {
    await register(req({ email: "dup@test.local", password: "hunter2pw" }));
    const res = await register(req({ email: "dup@test.local", password: "anotherpw" }));
    expect(res.status).toBe(409);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await register(req({ email: "not-an-email", password: "x" }));
    expect(res.status).toBe(400);
  });
});
