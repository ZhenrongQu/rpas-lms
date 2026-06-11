import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminLessonSchema } from "../../../../../src/lib/admin/contentSchemas";
import { validateLessonMdxBodies } from "../../../../../src/lib/admin/mdxValidation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/<admin>/lessons/[id] */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const row = await prisma.lesson.findUnique({ where: { id } });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row, { status: 200 });
}

/** PUT /api/<admin>/lessons/[id] — update editable fields; validates MDX before saving */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const existing = await prisma.lesson.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = adminLessonSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;

  // Only validate MDX when bodies changed.
  const bodiesChanged =
    input.bodyEN !== existing.bodyEN || input.bodyZH !== existing.bodyZH;
  if (bodiesChanged) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
      moduleId: existing.moduleId,
    });
    if (!result.ok) {
      return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
    }
  }

  const row = await prisma.lesson.update({
    where: { id },
    data: {
      titleEN: input.titleEN,
      titleZH: input.titleZH,
      order: input.order,
      estMinutes: input.estMinutes,
      certLevel: input.certLevel,
      access: input.access,
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
    },
  });

  // Invalidate the lesson page in all locales so edits are visible immediately.
  revalidatePath(`/en/learn/${existing.course}/${existing.moduleId}/${existing.slug}`);
  revalidatePath(`/zh/learn/${existing.course}/${existing.moduleId}/${existing.slug}`);

  return Response.json(row, { status: 200 });
}
