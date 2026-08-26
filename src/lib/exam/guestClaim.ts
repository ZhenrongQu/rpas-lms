import { prisma } from "../db";
import { GUEST_SESSION_TTL_MS } from "./config";

/**
 * Attaches an anonymous exam session to a newly registered account (PRD U6).
 *
 * Guest sessions are ownerless and reachable by their unguessable id alone, so
 * the claim conditions are the whole security boundary here: only a session that
 * still has NO owner and is still within its 24-hour lifetime may be claimed.
 * Loosen either and this becomes "anyone who learns a session id can take
 * someone else's exam record" — a privilege escalation, not a convenience.
 *
 * The check and the write are one conditional UPDATE rather than a read followed
 * by a write, so two simultaneous claims cannot both succeed.
 *
 * Returns true only if a session was actually claimed.
 */
export async function claimGuestSession(
  sessionId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.examSession.updateMany({
    where: {
      id: sessionId,
      userId: null,
      startedAt: { gt: new Date(now.getTime() - GUEST_SESSION_TTL_MS) },
    },
    data: { userId },
  });
  return count === 1;
}
