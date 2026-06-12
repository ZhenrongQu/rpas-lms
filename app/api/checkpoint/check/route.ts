import { z } from "zod";
import { findActiveQuestion } from "../../../../src/lib/content/loadBank";
import { correctOptionIds, isAnswerCorrect } from "../../../../src/lib/exam/grade";

const CheckBody = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
  locale: z.enum(["en", "zh"]).default("en"),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = CheckBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const { questionId, selectedOptionIds, locale } = parsed.data;
  const q = await findActiveQuestion(questionId);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  const L = locale === "zh" ? "ZH" : "EN";
  return Response.json(
    {
      correct: isAnswerCorrect(q, selectedOptionIds),
      correctOptionIds: correctOptionIds(q),
      explanation: q.explanation[L],
    },
    { status: 200 },
  );
}
