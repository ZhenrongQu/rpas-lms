import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST, DELETE } from "./book/route";
import { prisma } from "../../../src/lib/db";

const ELIG = "fr-route-elig";
const ELIG2 = "fr-route-elig2";
const INELIG = "fr-route-inelig";
const SLOT = "fr-route-slot";
const USERS = [ELIG, ELIG2, INELIG];

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function postReq(userId: string | null, slotId: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-test-user-id"] = userId;
  return new Request("http://test/api/flight-review/book", {
    method: "POST",
    headers,
    body: JSON.stringify({ slotId, locale: "en" }),
  });
}

async function cleanup() {
  await prisma.flightReviewBooking.deleteMany({ where: { customerId: { in: USERS } } });
  await prisma.flightReviewSlot.deleteMany({ where: { id: SLOT } });
  await prisma.entitlement.deleteMany({ where: { userId: { in: USERS } } });
  await prisma.customer.deleteMany({ where: { id: { in: USERS } } });
}

describe("POST/DELETE /api/flight-review/book", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.customer.createMany({
      data: [
        { id: ELIG, email: "fr-elig@test.dev", displayName: "Elig", accessTier: "PAID" },
        { id: ELIG2, email: "fr-elig2@test.dev", displayName: "Elig2", accessTier: "PAID" },
        { id: INELIG, email: "fr-inelig@test.dev", displayName: "Inelig", accessTier: "FREE" },
      ],
    });
    // ELIG + ELIG2 get the flight_review entitlement; INELIG is FREE with none.
    await prisma.entitlement.createMany({
      data: [
        { userId: ELIG, product: "flight_review", source: "test" },
        { userId: ELIG2, product: "flight_review", source: "test" },
      ],
    });
    await prisma.flightReviewSlot.create({
      data: { id: SLOT, startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("401 without an authenticated user", async () => {
    expect((await POST(postReq(null, SLOT))).status).toBe(401);
  });

  it("403 when the user is not eligible (FREE with no flight_review)", async () => {
    expect((await POST(postReq(INELIG, SLOT))).status).toBe(403);
    expect(await prisma.flightReviewBooking.findUnique({ where: { customerId: INELIG } })).toBeNull();
  });

  it("201 when an eligible user books an open slot", async () => {
    const res = await POST(postReq(ELIG, SLOT));
    expect(res.status).toBe(201);
    expect(await prisma.flightReviewBooking.findUnique({ where: { customerId: ELIG } })).not.toBeNull();
  });

  it("409 when a second eligible user books the taken slot", async () => {
    expect((await POST(postReq(ELIG2, SLOT))).status).toBe(409);
  });

  it("cancels the booking and frees the slot", async () => {
    const del = new Request("http://test/api/flight-review/book?locale=en", {
      method: "DELETE",
      headers: { "x-test-user-id": ELIG },
    });
    expect((await DELETE(del)).status).toBe(200);
    expect(await prisma.flightReviewBooking.findUnique({ where: { customerId: ELIG } })).toBeNull();
  });
});
