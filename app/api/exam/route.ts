import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";
import { canCreateExam } from "../../../src/lib/exam/access";
import { currentAccount } from "./sessionAuth";
import { InsufficientQuestionPoolError } from "../../../src/lib/exam/errors";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "ZH"]),
  seed: z.number().int().optional(),
});

export async function POST(req: Request): Promise<Response> {
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
  const account = await currentAccount(req);
  // GUEST (anonymous) and FREE may create Basic exams; Advanced requires PAID.
  if (!canCreateExam(account.accessTier, certLevel)) {
    return Response.json({ error: "upgrade required" }, { status: 403 });
  }
  // DEF-003 / U1: 409 (resource state), never 500 — the request is well-formed,
  // the bank just cannot fill a full paper right now. The message deliberately
  // carries no counts: pool sizes describe the shape of the question bank.
  try {
    const created = await examService.createMock(certLevel, locale, seed, account.userId, account.accessTier);
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientQuestionPoolError) {
      return Response.json({ error: "question pool unavailable" }, { status: 409 });
    }
    throw err;
  }
}
