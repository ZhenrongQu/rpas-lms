import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { bookSlot, cancelBooking, getUserBooking, listOpenSlots } from "./booking";

const U1 = "fr-book-u1";
const U2 = "fr-book-u2";
const SLOT_A = "fr-book-slot-a";
const SLOT_B = "fr-book-slot-b";
const SLOT_PAST = "fr-book-slot-past";
const USERS = [U1, U2];
const SLOTS = [SLOT_A, SLOT_B, SLOT_PAST];

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000);

async function cleanup() {
  await prisma.flightReviewBooking.deleteMany({ where: { customerId: { in: USERS } } });
  await prisma.flightReviewSlot.deleteMany({ where: { id: { in: SLOTS } } });
  await prisma.customer.deleteMany({ where: { id: { in: USERS } } });
}

describe("flight review booking", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.customer.createMany({
      data: [
        { id: U1, email: "fr-u1@test.dev", displayName: "U1", accessTier: "PAID" },
        { id: U2, email: "fr-u2@test.dev", displayName: "U2", accessTier: "PAID" },
      ],
    });
    await prisma.flightReviewSlot.createMany({
      data: [
        { id: SLOT_A, startsAt: plusDays(7), location: "YVR", examinerName: "Pat" },
        { id: SLOT_B, startsAt: plusDays(10), location: "YVR", examinerName: "Sam" },
        { id: SLOT_PAST, startsAt: plusDays(-1), location: "YVR", examinerName: "Old" },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("books an open future slot", async () => {
    const r = await bookSlot(U1, SLOT_A);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("created");
    expect((await getUserBooking(U1))?.slotId).toBe(SLOT_A);
  });

  it("rejects a second student booking the same slot", async () => {
    expect(await bookSlot(U2, SLOT_A)).toEqual({ ok: false, error: "slot_taken" });
  });

  it("rejects a past slot", async () => {
    expect(await bookSlot(U2, SLOT_PAST)).toEqual({ ok: false, error: "slot_past" });
  });

  it("reschedules: moves the booking and frees the old slot", async () => {
    const r = await bookSlot(U1, SLOT_B);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action).toBe("rescheduled");
      expect(r.previousSlot?.id).toBe(SLOT_A);
    }
    expect((await getUserBooking(U1))?.slotId).toBe(SLOT_B);
    const openIds = (await listOpenSlots()).map((s) => s.id);
    expect(openIds).toContain(SLOT_A); // reopened
    expect(openIds).not.toContain(SLOT_B); // now taken
  });

  it("cancel frees the slot", async () => {
    const removed = await cancelBooking(U1);
    expect(removed?.slotId).toBe(SLOT_B);
    expect(await getUserBooking(U1)).toBeNull();
    expect((await listOpenSlots()).map((s) => s.id)).toContain(SLOT_B);
  });
});
