import { prisma } from "../../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../../src/lib/auth/adminGuard";
import { adminSlotSchema } from "../../../../../../src/lib/flightReview/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/<admin>/flight-review/slots/[id] — edit a slot. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await prisma.flightReviewSlot.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const parsed = adminSlotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const { startsAt, ...rest } = parsed.data;
  const updated = await prisma.flightReviewSlot.update({
    where: { id },
    data: { ...rest, startsAt: new Date(startsAt) },
  });
  return Response.json(updated, { status: 200 });
}

/** DELETE /api/<admin>/flight-review/slots/[id] — remove a slot (blocked if booked). */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await prisma.flightReviewSlot.findUnique({
    where: { id },
    include: { booking: true },
  });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });
  if (existing.booking) {
    return Response.json({ error: "slot is booked — archive it instead" }, { status: 409 });
  }

  await prisma.flightReviewSlot.delete({ where: { id } });
  return Response.json({ ok: true }, { status: 200 });
}
