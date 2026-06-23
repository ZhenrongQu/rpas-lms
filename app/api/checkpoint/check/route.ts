import { z } from "zod";
import { findActiveCheckpoint } from "../../../../src/lib/content/loadBank";
import { correctOptionIds, isAnswerCorrect } from "../../../../src/lib/exam/grade";
import { clientIp, enforceRateLimit } from "../../../../src/lib/security/rateLimit";

// Reads the dedicated CheckpointQuestion bank only (SEC-04) — exam ids never
// resolve here, so this endpoint cannot expose exam answers.
const CheckBody = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
  locale: z.enum(["en", "zh"]).default("en"),
});

export async function POST(req: Request): Promise<Response> {
  // SEC-04: public, unauthenticated endpoint — cap per IP so the predictable
  // cp-<module>-NNNN ids can't be enumerated to scrape the checkpoint bank.
  const limited = await enforceRateLimit(`checkpoint:ip:${clientIp(req)}`, {
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
  const { questionId, selectedOptionIds, locale } = parsed.data;
  const q = await findActiveCheckpoint(questionId);
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
