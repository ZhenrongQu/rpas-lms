import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const questions = await examService.getPublicQuestions(id);
  if (questions === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(questions, { status: 200 });
}
