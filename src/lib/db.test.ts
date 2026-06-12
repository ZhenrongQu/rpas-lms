import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("prisma client", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects and round-trips a User row", async () => {
    const email = `smoke-${Date.now()}@test.local`;
    const created = await prisma.customer.create({
      data: { email, hashedPassword: "x" },
    });
    expect(created.id).toBeTruthy();

    const found = await prisma.customer.findUnique({ where: { email } });
    expect(found?.email).toBe(email);

    await prisma.customer.delete({ where: { id: created.id } });
  });
});
