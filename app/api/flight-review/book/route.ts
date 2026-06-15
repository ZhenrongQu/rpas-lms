import { prisma } from "../../../../src/lib/db";
import { canBookFlightReview } from "../../../../src/lib/payments/entitlements";
import { bookSlot, cancelBooking } from "../../../../src/lib/flightReview/booking";
import { notifyBookingChange, notifyCancellation } from "../../../../src/lib/flightReview/notifications";
import { bookSchema } from "../../../../src/lib/flightReview/schemas";
import { currentAccount } from "../../exam/sessionAuth";

async function student(userId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true },
  });
  if (!customer?.email) return null;
  return { email: customer.email, name: customer.displayName ?? customer.email };
}

/** POST /api/flight-review/book — book a slot or move an existing booking (reschedule). */
export async function POST(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });
  if (!(await canBookFlightReview(userId))) {
    return Response.json({ error: "not eligible" }, { status: 403 });
  }

  const parsed = bookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 422 });

  const result = await bookSlot(userId, parsed.data.slotId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });

  if (result.action !== "unchanged") {
    const who = await student(userId);
    if (who) {
      await notifyBookingChange({
        student: who,
        locale: parsed.data.locale,
        slot: result.booking.slot,
        previousSlot: result.previousSlot,
        kind: result.action === "rescheduled" ? "rescheduled" : "booked",
      });
    }
  }

  return Response.json({ ok: true, booking: result.booking }, {
    status: result.action === "created" ? 201 : 200,
  });
}

/** DELETE /api/flight-review/book — cancel the student's booking (frees the slot). */
export async function DELETE(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });

  const removed = await cancelBooking(userId);
  if (!removed) return Response.json({ error: "no booking" }, { status: 404 });

  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
  const who = await student(userId);
  if (who) await notifyCancellation({ student: who, locale, slot: removed.slot });

  return Response.json({ ok: true }, { status: 200 });
}
