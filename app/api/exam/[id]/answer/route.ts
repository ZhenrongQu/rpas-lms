import { z } from "zod";
import { examService } from "../../../../../src/lib/exam/instance";
import { requireExamOwner } from "../../sessionAuth";

type Ctx = { params: Promise<{ id: string }> };

const AnswerBody = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
});

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const denied = await requireExamOwner(req, id);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = AnswerBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const ok = await examService.answer(id, parsed.data.questionId, parsed.data.selectedOptionIds);
  if (!ok) {
    return Response.json({ error: "answer rejected" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
