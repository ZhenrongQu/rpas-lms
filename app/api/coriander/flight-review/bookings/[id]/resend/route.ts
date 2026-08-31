import { requireAdminApi } from "../../../../../../../src/lib/auth/adminGuard";
import { resendBookingConfirmation } from "../../../../../../../src/lib/flightReview/notifications";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/<admin>/flight-review/bookings/[id]/resend — re-send a student's
 *  confirmation after a delivery failure (PRD U12). */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
  const outcome = await resendBookingConfirmation(id, locale);
  if (outcome === "no_address") {
    return Response.json({ error: "booking not found or has no address" }, { status: 404 });
  }
  // An admin resending after a delivery failure must be told when it failed
  // again, or the queue looks cleared while nothing has been delivered.
  if (outcome === "delivery_failed") {
    return Response.json({ error: "delivery_failed" }, { status: 502 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
