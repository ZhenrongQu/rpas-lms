import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const submitted = await examService.submitWithIncorrectReview(id);
  if (submitted === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(submitted, { status: 200 });
}
