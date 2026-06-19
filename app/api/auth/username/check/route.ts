import { isUsernameAvailable } from "../../../../../src/lib/auth/account";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

export async function GET(req: Request): Promise<Response> {
  // P3: public, unauthenticated endpoint — cap per-IP so it can't be used to
  // enumerate taken usernames or hammer the DB. Generous enough for live typing.
  const limited = await enforceRateLimit(`username-check:ip:${clientIp(req)}`, {
    limit: 60,
    windowSec: 60,
    blockSec: 60,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const username = url.searchParams.get("username") ?? "";

  try {
    const available = await isUsernameAvailable(username);
    return Response.json({ available });
  } catch {
    return Response.json({ available: false }, { status: 400 });
  }
}
