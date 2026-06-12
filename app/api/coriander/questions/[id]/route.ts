import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminQuestionSchema } from "../../../../../src/lib/admin/contentSchemas";
import {
  questionScalarData,
  optionCreateData,
  findQuestionById,
  isQuestionReferencedByLesson,
} from "../../../../../src/lib/admin/questions";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/<admin>/questions/[id] (searches both banks) */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findQuestionById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(found.row, { status: 200 });
}

/** PUT /api/<admin>/questions/[id] — update scalars + replace options (in its own bank) */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findQuestionById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = adminQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;
  const data = {
    ...questionScalarData(input),
    options: { create: optionCreateData(input) },
  };

  // Delete-and-recreate options keeps things simple and avoids partial updates.
  const row =
    found.level === "BASIC"
      ? await prisma.$transaction(async (tx) => {
          await tx.basicQuestionOption.deleteMany({ where: { questionId: id } });
          return tx.basicQuestionBank.update({ where: { id }, data, include: { options: true } });
        })
      : await prisma.$transaction(async (tx) => {
          await tx.advancedQuestionOption.deleteMany({ where: { questionId: id } });
          return tx.advancedQuestionBank.update({ where: { id }, data, include: { options: true } });
        });

  return Response.json(row, { status: 200 });
}

/** DELETE /api/<admin>/questions/[id] — soft-archive (reject if referenced by a lesson) */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findQuestionById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  if (await isQuestionReferencedByLesson(id)) {
    return Response.json(
      { error: "question is referenced by a lesson and cannot be archived" },
      { status: 409 },
    );
  }

  const data = { status: "ARCHIVED", archivedAt: new Date() };
  const row =
    found.level === "BASIC"
      ? await prisma.basicQuestionBank.update({ where: { id }, data })
      : await prisma.advancedQuestionBank.update({ where: { id }, data });

  return Response.json(row, { status: 200 });
}
