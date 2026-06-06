import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "FR"]),
  seed: z.number().int().optional(),
});

// Resolve the signed-in user id without breaking when there is no request
// context (unit tests) or the user is a guest. Auth is additive, never gating.
async function currentUserId(): Promise<string | null> {
  try {
    const { auth } = await import("../../../auth");
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

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
  const userId = await currentUserId();
  const created = await examService.createMock(certLevel, locale, seed, userId);
  return Response.json(created, { status: 201 });
}
