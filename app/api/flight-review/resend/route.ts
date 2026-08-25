import { getActiveBooking } from "../../../../src/lib/flightReview/booking";
import { resendBookingConfirmation } from "../../../../src/lib/flightReview/notifications";
import { currentAccount } from "../../exam/sessionAuth";
import { enforceRateLimit } from "../../../../src/lib/security/rateLimit";

/** POST /api/flight-review/resend — email the student their own booking details
 *  again (PRD U12). Rate-limited: a resend button that sends an email per click
 *  is a harassment tool pointed at the student's own inbox. */
export async function POST(req: Request): Promise<Response> {
  const { userId } = await currentAccount(req);
  if (!userId) return Response.json({ error: "auth required" }, { status: 401 });

  const limited = await enforceRateLimit(`fr-resend:user:${userId}`, {
    limit: 1,
    windowSec: 60,
    blockSec: 60,
  });
  if (limited) return limited;

  const booking = await getActiveBooking(userId);
  if (!booking) return Response.json({ error: "no booking" }, { status: 404 });

  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
  if (!(await resendBookingConfirmation(booking.id, locale))) {
    return Response.json({ error: "no address on file" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
