import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const result = await examService.getResult(id);
  if (result === null) {
    return Response.json({ error: "not submitted or session not found" }, { status: 404 });
  }
  return Response.json(result, { status: 200 });
}
