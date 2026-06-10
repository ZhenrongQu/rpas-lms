import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminQuestionSchema } from "../../../../../src/lib/admin/contentSchemas";
import {
  questionScalarData,
  isQuestionReferencedByLesson,
} from "../../../../../src/lib/admin/questions";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/questions/[id] */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const row = await prisma.question.findUnique({
    where: { id },
    include: { options: true },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row, { status: 200 });
}

/** PUT /api/admin/questions/[id] — update scalars + replace options */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = adminQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;

  // Delete-and-recreate options keeps things simple and avoids partial updates.
  const row = await prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    return tx.question.update({
      where: { id },
      data: {
        ...questionScalarData(input),
        options: {
          create: input.options.map((o) => ({
            optionId: o.optionId,
            labelEN: o.labelEN,
            labelZH: o.labelZH,
            isCorrect: o.isCorrect,
          })),
        },
      },
      include: { options: true },
    });
  });

  return Response.json(row, { status: 200 });
}

/** DELETE /api/admin/questions/[id] — soft-archive (reject if referenced by a lesson) */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  if (await isQuestionReferencedByLesson(id)) {
    return Response.json(
      { error: "question is referenced by a lesson and cannot be archived" },
      { status: 409 },
    );
  }

  const row = await prisma.question.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  return Response.json(row, { status: 200 });
}
