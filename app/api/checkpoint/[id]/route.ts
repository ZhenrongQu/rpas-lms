import { findActiveCheckpoint } from "../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "ZH" : "EN";
  const question = await findActiveCheckpoint(id);
  if (!question) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toPublicQuestion(question, locale), { status: 200 });
}
