import { examService } from "../../../../src/lib/exam/instance";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";

export async function requireMobileExamOwner(req: Request, sessionId: string): Promise<Response | null> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  if (ownerId !== auth.account.userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return null;
}
