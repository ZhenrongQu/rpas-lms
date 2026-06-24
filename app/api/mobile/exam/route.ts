import { z } from "zod";
import { examService } from "../../../../src/lib/exam/instance";
import { canCreateExam } from "../../../../src/lib/exam/access";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";

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

  const created = await examService.createMock(certLevel, locale, seed, auth.account.userId, auth.account.accessTier);
  return Response.json(created, { status: 201 });
}
