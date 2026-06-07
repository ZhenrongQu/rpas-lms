import { examService } from "../../../src/lib/exam/instance";
import type { AccessTier } from "../../../src/lib/exam/access";

export async function currentAccount(req: Request): Promise<{ userId: string | null; accessTier: AccessTier }> {
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

export async function requireExamOwner(req: Request, sessionId: string): Promise<Response | null> {
  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const account = await currentAccount(req);
  if (!account.userId) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  if (ownerId !== account.userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return null;
}
