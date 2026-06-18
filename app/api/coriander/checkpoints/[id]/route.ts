import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminCheckpointSchema } from "../../../../../src/lib/admin/contentSchemas";
import {
  checkpointScalarData,
  checkpointOptionCreateData,
  findCheckpointById,
} from "../../../../../src/lib/admin/checkpoints";
import { lessonExists } from "../../../../../src/lib/lessons/progress";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/coriander/checkpoints/[id] */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const row = await findCheckpointById(id);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row, { status: 200 });
}

/** PUT /api/coriander/checkpoints/[id] — update scalars + replace options. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await findCheckpointById(id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const parsed = adminCheckpointSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const input = parsed.data;
  if (!(await lessonExists(input.lessonId))) {
    return Response.json({ error: "lesson not found" }, { status: 422 });
  }

  const data = {
    ...checkpointScalarData(input),
    options: { create: checkpointOptionCreateData(input) },
  };

  // Delete-and-recreate options keeps things simple and avoids partial updates.
  const row = await prisma.$transaction(async (tx) => {
    await tx.checkpointQuestionOption.deleteMany({ where: { questionId: id } });
    return tx.checkpointQuestion.update({ where: { id }, data, include: { options: true } });
  });
  return Response.json(row, { status: 200 });
}

/** DELETE /api/coriander/checkpoints/[id] — soft-archive. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await findCheckpointById(id);
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const row = await prisma.checkpointQuestion.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  return Response.json(row, { status: 200 });
}
