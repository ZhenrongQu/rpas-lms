import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import { adminQuestionSchema } from "../../../../src/lib/admin/contentSchemas";
import {
  questionScalarData,
  optionCreateData,
  nextQuestionId,
} from "../../../../src/lib/admin/questions";

/** GET /api/admin/questions?moduleId=&certLevel=&difficulty=&q= */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const moduleId = url.searchParams.get("moduleId") ?? undefined;
  const certLevel = url.searchParams.get("certLevel") ?? undefined;
  const difficulty = url.searchParams.get("difficulty");
  const q = url.searchParams.get("q") ?? undefined;

  const rows = await prisma.question.findMany({
    where: {
      ...(moduleId ? { moduleId } : {}),
      ...(certLevel ? { certLevel } : {}),
      ...(difficulty !== null ? { difficulty: Number(difficulty) } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q } },
              { stemEN: { contains: q } },
              { stemZH: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      moduleId: true,
      certLevel: true,
      type: true,
      difficulty: true,
      status: true,
      stemEN: true,
      stemZH: true,
      tags: true,
    },
    orderBy: [{ moduleId: "asc" }, { id: "asc" }],
  });

  return Response.json(rows, { status: 200 });
}

/** POST /api/admin/questions — create a new question */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const parsed = adminQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;
  const id = await nextQuestionId(input.moduleId);

  const row = await prisma.question.create({
    data: {
      id,
      ...questionScalarData(input),
      status: "ACTIVE",
      options: { create: optionCreateData(input) },
    },
    include: { options: true },
  });

  return Response.json(row, { status: 201 });
}
