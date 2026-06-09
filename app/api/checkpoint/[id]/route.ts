import { prisma } from "../../../../src/lib/db";
import { dbQuestionToQuestion } from "../../../../src/lib/content/dbMappers";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "ZH" : "EN";
  const row = await prisma.question.findFirst({
    where: { id, status: "ACTIVE" },
    include: { options: true },
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublicQuestion(dbQuestionToQuestion(row), locale), { status: 200 });
}
