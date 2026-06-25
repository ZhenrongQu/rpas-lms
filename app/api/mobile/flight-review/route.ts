import { z } from "zod";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { canBookFlightReview } from "../../../../src/lib/payments/entitlements";
import {
  listOpenSlots,
  getUserBooking,
  bookSlot,
  cancelBooking,
} from "../../../../src/lib/flightReview/booking";
import {
  notifyBookingChange,
  notifyCancellation,
} from "../../../../src/lib/flightReview/notifications";

const BookBody = z.object({ slotId: z.string().min(1) }).strict();

function localeFrom(req: Request): "en" | "zh" {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

function slotJSON(slot: {
  id: string;
  startsAt: Date;
  durationMin: number;
  location: string;
  examinerName: string;
}) {
  return {
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    durationMin: slot.durationMin,
    location: slot.location,
    examinerName: slot.examinerName,
  };
}

/** GET — bookable slots, the student's current booking, and eligibility. */
export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const [eligible, booking, slots] = await Promise.all([
    canBookFlightReview(auth.account.userId),
    getUserBooking(auth.account.userId),
    listOpenSlots(),
  ]);

  return Response.json({
    eligible,
    booking: booking ? { id: booking.id, slot: slotJSON(booking.slot) } : null,
    slots: slots.map(slotJSON),
  });
}

/** POST { slotId } — book a slot or move an existing booking (reschedule). */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;
  if (!(await canBookFlightReview(auth.account.userId))) {
    return Response.json({ error: "not_eligible" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = BookBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const result = await bookSlot(auth.account.userId, parsed.data.slotId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });

  if (result.action !== "unchanged" && auth.account.email) {
    await notifyBookingChange({
      student: { email: auth.account.email, name: auth.account.name ?? auth.account.email },
      locale: localeFrom(req),
      slot: result.booking.slot,
      previousSlot: result.previousSlot,
      kind: result.action === "rescheduled" ? "rescheduled" : "booked",
    });
  }

  return Response.json(
    { ok: true, booking: { id: result.booking.id, slot: slotJSON(result.booking.slot) } },
    { status: result.action === "created" ? 201 : 200 },
  );
}

/** DELETE — cancel the student's booking (frees the slot). */
export async function DELETE(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const removed = await cancelBooking(auth.account.userId);
  if (!removed) return Response.json({ error: "no_booking" }, { status: 404 });

  if (auth.account.email) {
    await notifyCancellation({
      student: { email: auth.account.email, name: auth.account.name ?? auth.account.email },
      locale: localeFrom(req),
      slot: removed.slot,
    });
  }

  return Response.json({ ok: true });
}
