import { examService } from "../../../../../../src/lib/exam/instance";
import { requireMobileExamOwner } from "../../auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await requireMobileExamOwner(req, id);
  if (denied) return denied;

  const questions = await examService.getPublicQuestions(id);
  if (questions === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(questions, { status: 200 });
}
