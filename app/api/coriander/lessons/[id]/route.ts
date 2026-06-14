import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../src/lib/auth/adminGuard";
import { adminLessonSchema } from "../../../../../src/lib/admin/contentSchemas";
import { validateLessonMdxBodies } from "../../../../../src/lib/admin/mdxValidation";
import { findLessonById } from "../../../../../src/lib/admin/lessons";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/<admin>/lessons/[id] (searches both course tables) */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(found.row, { status: 200 });
}

/** PUT /api/<admin>/lessons/[id] — update editable fields; validates MDX before saving */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  const { course, row: existing } = found;

  const body = await req.json().catch(() => null);
  const parsed = adminLessonSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;

  // Validate MDX only when bodies changed AND are non-empty (video-only lessons
  // may legitimately have empty bodies).
  const bodiesChanged = input.bodyEN !== existing.bodyEN || input.bodyZH !== existing.bodyZH;
  const hasBody = input.bodyEN.trim().length > 0 || input.bodyZH.trim().length > 0;
  if (bodiesChanged && hasBody) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
      moduleId: existing.moduleId,
      course,
    });
    if (!result.ok) {
      return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
    }
  }

  const data = {
    titleEN: input.titleEN,
    titleZH: input.titleZH,
    order: input.order,
    estMinutes: input.estMinutes,
    certLevel: input.certLevel,
    access: input.access,
    bodyEN: input.bodyEN,
    bodyZH: input.bodyZH,
  };
  const row =
    course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });

  // Invalidate the lesson page in all locales so edits are visible immediately.
  revalidatePath(`/en/learn/${existing.course}/${existing.moduleId}/${existing.slug}`);
  revalidatePath(`/zh/learn/${existing.course}/${existing.moduleId}/${existing.slug}`);

  return Response.json(row, { status: 200 });
}
