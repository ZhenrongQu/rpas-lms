import { z } from "zod";
import { examService } from "../../../../src/lib/exam/instance";
import { canCreateExam } from "../../../../src/lib/exam/access";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { InsufficientQuestionPoolError } from "../../../../src/lib/exam/errors";

const CreateBody = z
  .object({
    certLevel: z.enum(["BASIC", "ADVANCED"]),
    locale: z.enum(["EN", "ZH"]),
    seed: z.number().int().optional(),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { certLevel, locale, seed } = parsed.data;
  if (!canCreateExam(auth.account.accessTier, certLevel)) {
    return Response.json({ error: "upgrade required" }, { status: 403 });
  }

  // DEF-003 / U1: mirrors the web route — 409, no bank internals in the message.
  try {
    const created = await examService.createMock(certLevel, locale, seed, auth.account.userId, auth.account.accessTier);
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientQuestionPoolError) {
      return Response.json({ error: "question pool unavailable" }, { status: 409 });
    }
    throw err;
  }
}
