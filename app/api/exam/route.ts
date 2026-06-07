import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";
import { canCreateExam } from "../../../src/lib/exam/access";
import { currentAccount } from "./sessionAuth";

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
  if (!account.userId) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  if (!canCreateExam(account.accessTier, certLevel)) {
    return Response.json({ error: "upgrade required" }, { status: 403 });
  }
  const created = await examService.createMock(certLevel, locale, seed, account.userId, account.accessTier);
  return Response.json(created, { status: 201 });
}
