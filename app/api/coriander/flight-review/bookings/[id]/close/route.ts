import { z } from "zod";
import { requireAdminApi } from "../../../../../../../src/lib/auth/adminGuard";
import { closeBooking } from "../../../../../../../src/lib/flightReview/booking";

type Ctx = { params: Promise<{ id: string }> };

/** Either outcome burns the credit; only a human knows which one happened. */
const closeSchema = z.object({ outcome: z.enum(["COMPLETED", "NO_SHOW"]) });

/** POST /api/<admin>/flight-review/bookings/[id]/close — close out a review after
 *  the appointment (PRD U13 §13.4). 409 if the booking is not in progress. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = closeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await ctx.params;
  if (!(await closeBooking(id, parsed.data.outcome))) {
    return Response.json({ error: "booking is not in progress" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
