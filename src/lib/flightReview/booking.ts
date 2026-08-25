import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  consumeCreditFor,
  holdCreditForBooking,
  releaseCreditFor,
  type Db,
} from "./credits";

export type SlotWithBookings = Prisma.FlightReviewSlotGetPayload<{ include: { bookings: true } }>;
export type BookingWithSlot = Prisma.FlightReviewBookingGetPayload<{ include: { slot: true } }>;

/** Cancel at least this far ahead and the credit comes back; later and it burns
 *  (PRD U13 §13.4). The examiner's time is already committed inside the window. */
export const CANCELLATION_REFUND_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Only a BOOKED row occupies anything. CANCELLED / COMPLETED / NO_SHOW rows are
 *  history and must not keep a slot or a customer blocked. */
const ACTIVE = { status: "BOOKED" } as const;

/** Signals "no spendable credit" from inside the booking transaction so the
 *  half-created booking rolls back instead of being left orphaned. */
class NoCreditError extends Error {}

/** Open slots a student can book: ACTIVE, in the future, not currently taken. */
export async function listOpenSlots(): Promise<SlotWithBookings[]> {
  return prisma.flightReviewSlot.findMany({
    where: { status: "ACTIVE", startsAt: { gt: new Date() }, bookings: { none: ACTIVE } },
    include: { bookings: { where: ACTIVE } },
    orderBy: { startsAt: "asc" },
  });
}

/** The student's in-progress booking (with its slot), or null. */
export async function getActiveBooking(userId: string, db: Db = prisma): Promise<BookingWithSlot | null> {
  return db.flightReviewBooking.findFirst({
    where: { customerId: userId, ...ACTIVE },
    include: { slot: true },
  });
}

/** Every booking the student has ever made, newest first — past reviews included. */
export async function listUserBookings(userId: string): Promise<BookingWithSlot[]> {
  return prisma.flightReviewBooking.findMany({
    where: { customerId: userId },
    include: { slot: true },
    orderBy: { createdAt: "desc" },
  });
}

export type BookResult =
  | {
      ok: true;
      booking: BookingWithSlot;
      previousSlot: BookingWithSlot["slot"] | null;
      action: "created" | "rescheduled" | "unchanged";
    }
  | { ok: false; error: "slot_unavailable" | "slot_past" | "slot_taken" | "already_booked" | "no_credit" };

/**
 * Books `slotId`, or moves the student's in-progress booking to it (reschedule).
 *
 * A new booking spends a credit; a reschedule does not — the original credit
 * follows the booking to its new slot (PRD U13 §13.4).
 *
 * Concurrency is held by two partial unique indexes (prisma/sql/), not by these
 * checks: `(slotId) WHERE status='BOOKED'` and `(customerId) WHERE status='BOOKED'`.
 * A concurrent second writer hits P2002 and is translated below, so the read
 * checks here exist to produce good error messages, not to be the guarantee.
 */
export async function bookSlot(userId: string, slotId: string): Promise<BookResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const slot = await tx.flightReviewSlot.findUnique({
        where: { id: slotId },
        include: { bookings: { where: ACTIVE } },
      });
      if (!slot || slot.status !== "ACTIVE") return { ok: false, error: "slot_unavailable" } as const;
      if (slot.startsAt <= new Date()) return { ok: false, error: "slot_past" } as const;

      const taken = slot.bookings[0];
      if (taken && taken.customerId !== userId) return { ok: false, error: "slot_taken" } as const;

      const existing = await getActiveBooking(userId, tx);
      if (existing && existing.slotId === slotId) {
        return { ok: true, booking: existing, previousSlot: null, action: "unchanged" } as const;
      }

      if (existing) {
        const booking = await tx.flightReviewBooking.update({
          where: { id: existing.id },
          data: { slotId },
          include: { slot: true },
        });
        return { ok: true, booking, previousSlot: existing.slot, action: "rescheduled" } as const;
      }

      const booking = await tx.flightReviewBooking.create({
        data: { customerId: userId, slotId },
        include: { slot: true },
      });
      if (!(await holdCreditForBooking(userId, booking.id, tx))) throw new NoCreditError();
      return { ok: true, booking, previousSlot: null, action: "created" } as const;
    });
  } catch (err) {
    if (err instanceof NoCreditError) return { ok: false, error: "no_credit" };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Which invariant fired matters to the user: "someone took that slot" and
      // "you already have a review booked" are different problems.
      const target = String(err.meta?.target ?? "");
      return { ok: false, error: target.includes("customer") ? "already_booked" : "slot_taken" };
    }
    throw err;
  }
}

export type CancelResult = { booking: BookingWithSlot; creditRefunded: boolean };

/**
 * Cancels the student's in-progress booking, freeing the slot. The row is kept as
 * history (status CANCELLED) rather than deleted, so the credit's audit trail
 * survives. Returns null when there is nothing to cancel.
 */
export async function cancelBooking(userId: string, now: Date = new Date()): Promise<CancelResult | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await getActiveBooking(userId, tx);
    if (!existing) return null;

    const creditRefunded =
      existing.slot.startsAt.getTime() - now.getTime() >= CANCELLATION_REFUND_WINDOW_MS;
    if (creditRefunded) await releaseCreditFor(existing.id, tx);
    else await consumeCreditFor(existing.id, tx, now);

    const booking = await tx.flightReviewBooking.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", cancelledAt: now },
      include: { slot: true },
    });
    return { booking, creditRefunded };
  });
}

/**
 * Closes out a booking after the appointment (PRD U13 §13.4). Done by a human,
 * not a timer: only the examiner knows whether the student actually showed up,
 * and auto-completing on time would silently count no-shows as reviews delivered.
 * Either outcome burns the credit. Returns false if the booking isn't in progress.
 */
export async function closeBooking(
  bookingId: string,
  outcome: "COMPLETED" | "NO_SHOW",
  now: Date = new Date(),
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.flightReviewBooking.updateMany({
      where: { id: bookingId, ...ACTIVE },
      data: { status: outcome, completedAt: now },
    });
    if (count === 0) return false;
    await consumeCreditFor(bookingId, tx, now);
    return true;
  });
}
