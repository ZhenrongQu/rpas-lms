import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import { adminLessonCreateSchema } from "../../../../src/lib/admin/contentSchemas";
import { validateLessonMdxBodies } from "../../../../src/lib/admin/mdxValidation";
import { createLesson } from "../../../../src/lib/admin/lessons";
import { reindexLesson } from "../../../../src/lib/agents/chat/rag/ingest";
import { MODULE_IDS } from "../../../../src/lib/content/types";

/** GET /api/<admin>/lessons?course=&moduleId=&access= */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const course = url.searchParams.get("course") ?? undefined;
  const rawModuleId = url.searchParams.get("moduleId");
  const moduleId =
    rawModuleId && (MODULE_IDS as readonly string[]).includes(rawModuleId) ? rawModuleId : undefined;
  const accessParam = url.searchParams.get("access");
  const access = accessParam === "FREE" || accessParam === "PAID" ? accessParam : undefined;

  const where = {
    ...(moduleId ? { moduleId } : {}),
    ...(access ? { access } : {}),
  };
  const select = {
    id: true,
    lessonId: true,
    course: true,
    moduleId: true,
    slug: true,
    order: true,
    estMinutes: true,
    certLevel: true,
    access: true,
    titleEN: true,
    titleZH: true,
  };
  const orderBy = [{ moduleId: "asc" as const }, { order: "asc" as const }];

  const [basic, advanced] = await Promise.all([
    course === "advanced" ? [] : prisma.basicLesson.findMany({ where, select, orderBy }),
    course === "basic" ? [] : prisma.advancedLesson.findMany({ where, select, orderBy }),
  ]);

  return Response.json([...basic, ...advanced], { status: 200 });
}

/** POST /api/<admin>/lessons — create a lesson in the table named by `course`. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const parsed = adminLessonCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  // Validate MDX only when a body is actually present (video-only lessons may be empty).
  if (input.bodyEN.trim() || input.bodyZH.trim()) {
    const result = await validateLessonMdxBodies({
      bodyEN: input.bodyEN,
      bodyZH: input.bodyZH,
    });
    if (!result.ok) {
      return Response.json({ error: "MDX validation failed", details: result.errors }, { status: 422 });
    }
  }

  const created = await createLesson(input);
  if (!created.ok) {
    return Response.json(
      { error: `A lesson with slug "${input.slug}" already exists in ${input.course}/${input.moduleId}` },
      { status: 409 },
    );
  }

  // Index the new lesson into the RAG corpus after the response (see PUT route):
  // best-effort, and off the request's critical path so it can't block the create.
  after(() =>
    reindexLesson(created.row).catch((err) =>
      console.error(
        `[rag] post-create reindex failed for ${created.row.lessonId}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    ),
  );

  // Surface the new lesson on its module listing immediately, in both locales.
  revalidatePath(`/en/learn/${input.course}/${input.moduleId}`);
  revalidatePath(`/zh/learn/${input.course}/${input.moduleId}`);

  return Response.json(created.row, { status: 201 });
}
