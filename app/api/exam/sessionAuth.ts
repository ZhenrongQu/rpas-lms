import { examService } from "../../../src/lib/exam/instance";
import type { AccessTier } from "../../../src/lib/exam/access";

export async function currentAccount(req: Request): Promise<{ userId: string | null; accessTier: AccessTier }> {
  // SEC-05: the x-test-user-id impersonation header is gated on BOTH the test
  // NODE_ENV AND an explicit opt-in flag (set only in vitest.config.ts), so a
  // misconfigured NODE_ENV in production can never re-enable this backdoor.
  if (process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_AUTH === "1") {
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

  // Anonymous (guest) sessions have no owner and are accessible by their
  // (unguessable) session id — this is the free anonymous Basic taster.
  if (ownerId === null) {
    return null;
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
