import { loadQuestionBank } from "../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";

const bank = loadQuestionBank();
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "ZH" : "EN";
  const q = bank.questions.find((x) => x.id === id);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublicQuestion(q, locale), { status: 200 });
}
