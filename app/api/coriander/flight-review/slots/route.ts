import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminSlotSchema } from "../../../../../src/lib/flightReview/schemas";

/** GET /api/<admin>/flight-review/slots — all slots with who booked each. */
export async function GET(): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const slots = await prisma.flightReviewSlot.findMany({
    include: {
      booking: {
        include: { customer: { select: { displayName: true, email: true, phone: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  return Response.json(slots, { status: 200 });
}

/** POST /api/<admin>/flight-review/slots — create a bookable slot. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = adminSlotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { startsAt, ...rest } = parsed.data;
  const created = await prisma.flightReviewSlot.create({
    data: { ...rest, startsAt: new Date(startsAt) },
  });
  return Response.json(created, { status: 201 });
}
