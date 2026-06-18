import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import { adminCheckpointSchema } from "../../../../src/lib/admin/contentSchemas";
import {
  checkpointScalarData,
  checkpointOptionCreateData,
  nextCheckpointId,
} from "../../../../src/lib/admin/checkpoints";
import { lessonExists } from "../../../../src/lib/lessons/progress";
import { MODULE_IDS } from "../../../../src/lib/content/types";

/** GET /api/coriander/checkpoints?course=&moduleId=&lessonId=&q= */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const lessonId = url.searchParams.get("lessonId") ?? undefined;
  const rawModuleId = url.searchParams.get("moduleId");
  const moduleId =
    rawModuleId && (MODULE_IDS as readonly string[]).includes(rawModuleId) ? rawModuleId : undefined;
  const courseParam = url.searchParams.get("course");
  const course = courseParam === "basic" || courseParam === "advanced" ? courseParam : undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const where = {
    ...(lessonId ? { lessonId } : {}),
    ...(moduleId ? { moduleId } : {}),
    ...(course ? { course } : {}),
    ...(q
      ? { OR: [{ id: { contains: q } }, { stemEN: { contains: q } }, { stemZH: { contains: q } }] }
      : {}),
  };

  const rows = await prisma.checkpointQuestion.findMany({
    where,
    select: {
      id: true,
      lessonId: true,
      course: true,
      moduleId: true,
      order: true,
      type: true,
      status: true,
      stemEN: true,
    },
    orderBy: [{ lessonId: "asc" }, { order: "asc" }, { id: "asc" }],
  });
  return Response.json(rows, { status: 200 });
}

/** POST /api/coriander/checkpoints — create a checkpoint assigned to a lesson. */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const parsed = adminCheckpointSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const input = parsed.data;
  if (!(await lessonExists(input.lessonId))) {
    return Response.json({ error: "lesson not found" }, { status: 422 });
  }

  const id = await nextCheckpointId(input.moduleId);
  const row = await prisma.checkpointQuestion.create({
    data: {
      id,
      ...checkpointScalarData(input),
      status: "ACTIVE",
      options: { create: checkpointOptionCreateData(input) },
    },
    include: { options: true },
  });
  return Response.json(row, { status: 201 });
}
