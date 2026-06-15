import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export type SlotWithBooking = Prisma.FlightReviewSlotGetPayload<{ include: { booking: true } }>;
export type BookingWithSlot = Prisma.FlightReviewBookingGetPayload<{ include: { slot: true } }>;

/** Open slots a student can book: ACTIVE, in the future, and not already taken. */
export async function listOpenSlots(): Promise<SlotWithBooking[]> {
  return prisma.flightReviewSlot.findMany({
    where: { status: "ACTIVE", startsAt: { gt: new Date() }, booking: { is: null } },
    include: { booking: true },
    orderBy: { startsAt: "asc" },
  });
}

/** The student's single active booking (with its slot), or null. */
export async function getUserBooking(userId: string): Promise<BookingWithSlot | null> {
  return prisma.flightReviewBooking.findUnique({
    where: { customerId: userId },
    include: { slot: true },
  });
}

export type BookResult =
  | {
      ok: true;
      booking: BookingWithSlot;
      previousSlot: BookingWithSlot["slot"] | null;
      action: "created" | "rescheduled" | "unchanged";
    }
  | { ok: false; error: "slot_unavailable" | "slot_past" | "slot_taken" };

/**
 * Books `slotId` for the user, or moves their existing booking to it (reschedule).
 * The `slotId @unique` constraint makes double-booking impossible: a concurrent
 * second writer hits P2002, which we translate to `slot_taken`.
 */
export async function bookSlot(userId: string, slotId: string): Promise<BookResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const slot = await tx.flightReviewSlot.findUnique({
        where: { id: slotId },
        include: { booking: true },
      });
      if (!slot || slot.status !== "ACTIVE") return { ok: false, error: "slot_unavailable" } as const;
      if (slot.startsAt <= new Date()) return { ok: false, error: "slot_past" } as const;
      if (slot.booking && slot.booking.customerId !== userId) {
        return { ok: false, error: "slot_taken" } as const;
      }

      const existing = await tx.flightReviewBooking.findUnique({
        where: { customerId: userId },
        include: { slot: true },
      });
      if (existing && existing.slotId === slotId) {
        return { ok: true, booking: existing, previousSlot: null, action: "unchanged" } as const;
      }

      const booking = await tx.flightReviewBooking.upsert({
        where: { customerId: userId },
        create: { customerId: userId, slotId },
        update: { slotId },
        include: { slot: true },
      });
      return {
        ok: true,
        booking,
        previousSlot: existing?.slot ?? null,
        action: existing ? "rescheduled" : "created",
      } as const;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "slot_taken" };
    }
    throw err;
  }
}

/** Cancels the student's booking (frees the slot). Returns the removed booking, or null. */
export async function cancelBooking(userId: string): Promise<BookingWithSlot | null> {
  const existing = await getUserBooking(userId);
  if (!existing) return null;
  await prisma.flightReviewBooking.delete({ where: { customerId: userId } });
  return existing;
}
