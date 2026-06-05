import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "FR"]),
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
  const created = await examService.createMock(certLevel, locale, seed);
  return Response.json(created, { status: 201 });
}
