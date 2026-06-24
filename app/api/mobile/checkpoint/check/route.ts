import { z } from "zod";
import { findActiveCheckpoint } from "../../../../../src/lib/content/loadBank";
import { isAnswerCorrect } from "../../../../../src/lib/exam/grade";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const CheckBody = z
  .object({
    id: z.string().min(1).optional(),
    questionId: z.string().min(1).optional(),
    selectedOptionIds: z.array(z.string()),
    locale: z.enum(["en", "zh"]).default("en"),
  })
  .refine((body) => Boolean(body.id ?? body.questionId));

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(`mobile-checkpoint:ip:${clientIp(req)}`, {
    limit: 120,
    windowSec: 60,
    blockSec: 60,
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = CheckBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const { selectedOptionIds, locale } = parsed.data;
  const id = parsed.data.id ?? parsed.data.questionId!;
  const question = await findActiveCheckpoint(id);
  if (!question) return Response.json({ error: "not found" }, { status: 404 });

  const L = locale === "zh" ? "ZH" : "EN";
  return Response.json(
    {
      ok: isAnswerCorrect(question, selectedOptionIds),
      explanation: question.explanation[L],
      reference: question.reference[L],
    },
    { status: 200 },
  );
}
