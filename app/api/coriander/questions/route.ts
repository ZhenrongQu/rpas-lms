import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";
import { MODULE_IDS } from "../../../../src/lib/content/types";
import { adminQuestionSchema } from "../../../../src/lib/admin/contentSchemas";
import {
  questionScalarData,
  optionCreateData,
  nextQuestionId,
} from "../../../../src/lib/admin/questions";

/** GET /api/<admin>/questions?level=&moduleId=&difficulty=&q= (level selects the bank) */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const level = url.searchParams.get("level") === "ADVANCED" ? "ADVANCED" : "BASIC";
  const rawModuleId = url.searchParams.get("moduleId");
  const moduleId =
    rawModuleId && (MODULE_IDS as readonly string[]).includes(rawModuleId) ? rawModuleId : undefined;
  const rawDifficulty = url.searchParams.get("difficulty");
  const difficulty =
    rawDifficulty !== null && /^[0-3]$/.test(rawDifficulty) ? Number(rawDifficulty) : null;
  const q = url.searchParams.get("q") ?? undefined;

  const where = {
    ...(moduleId ? { moduleId } : {}),
    ...(difficulty !== null ? { difficulty } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q } },
            { stemEN: { contains: q } },
            { stemZH: { contains: q } },
          ],
        }
      : {}),
  };
  const select = {
    id: true,
    moduleId: true,
    certLevel: true,
    type: true,
    difficulty: true,
    status: true,
    stemEN: true,
    stemZH: true,
    tags: true,
  };
  const orderBy = [{ moduleId: "asc" as const }, { id: "asc" as const }];

  const rows =
    level === "BASIC"
      ? await prisma.basicQuestionBank.findMany({ where, select, orderBy })
      : await prisma.advancedQuestionBank.findMany({ where, select, orderBy });

  return Response.json(rows, { status: 200 });
}

/** POST /api/<admin>/questions — create a new question in the bank named by `level` */
export async function POST(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const parsed = adminQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const input = parsed.data;
  const id = await nextQuestionId(input.moduleId, input.level);
  const data = {
    id,
    ...questionScalarData(input),
    status: "ACTIVE",
    options: { create: optionCreateData(input) },
  };

  const row =
    input.level === "BASIC"
      ? await prisma.basicQuestionBank.create({ data, include: { options: true } })
      : await prisma.advancedQuestionBank.create({ data, include: { options: true } });

  return Response.json(row, { status: 201 });
}
