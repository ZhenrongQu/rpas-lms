import { examService } from "../../../../../src/lib/exam/instance";
import { requireExamOwner } from "../../sessionAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await requireExamOwner(req, id);
  if (denied) return denied;
  const result = await examService.getResult(id);
  if (result === null) {
    return Response.json({ error: "not submitted or session not found" }, { status: 404 });
  }
  return Response.json(result, { status: 200 });
}
