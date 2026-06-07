import { examService } from "../../../../../src/lib/exam/instance";
import { requireExamOwner } from "../../sessionAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await requireExamOwner(req, id);
  if (denied) return denied;
  const submitted = await examService.submitWithIncorrectReview(id);
  if (submitted === null) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json(submitted, { status: 200 });
}
