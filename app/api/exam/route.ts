import { z } from "zod";
import { examService } from "../../../src/lib/exam/instance";
import { canCreateExam, type AccessTier } from "../../../src/lib/exam/access";

const CreateBody = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "ZH"]),
  seed: z.number().int().optional(),
});

// Resolve the signed-in user id without breaking when there is no request
// context (unit tests) or the user is a guest. Auth is additive, never gating.
async function currentAccount(req: Request): Promise<{ userId: string | null; accessTier: AccessTier }> {
  if (process.env.NODE_ENV === "test") {
    const userId = req.headers.get("x-test-user-id");
    const tier = req.headers.get("x-test-access-tier");
    if (userId) {
      return {
        userId,
        accessTier: tier === "PAID" ? "PAID" : "FREE",
      };
    }
  }

  try {
    const { auth } = await import("../../../auth");
    const session = await auth();
    return {
      userId: session?.user?.id ?? null,
      accessTier: session?.user?.accessTier === "PAID" ? "PAID" : session?.user?.id ? "FREE" : "GUEST",
    };
  } catch {
    return { userId: null, accessTier: "GUEST" };
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
