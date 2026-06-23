import { z } from "zod";
import { resetLocalPassword } from "../../../../../src/lib/auth/localAccount";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const Body = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8).max(72),
}).strict();

export async function POST(req: Request): Promise<Response> {
  // SEC: cap reset submissions per IP. Unlike forgot, this endpoint runs a
  // bcrypt verify per attempt, so throttling blocks token-guessing / CPU abuse.
  const ipLimited = await enforceRateLimit(`reset:ip:${clientIp(req)}`, {
    limit: 15,
    windowSec: 15 * 60,
    blockSec: 15 * 60,
  });
  if (ipLimited) return ipLimited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // SEC: per-target cap so one inbox's token can't be brute-forced across IPs.
  const targetLimited = await enforceRateLimit(`reset:email:${parsed.data.email.trim().toLowerCase()}`, {
    limit: 10,
    windowSec: 60 * 60,
    blockSec: 60 * 60,
  });
  if (targetLimited) return targetLimited;

  const result = await resetLocalPassword(parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 400 });
  }

  return Response.json({ ok: true });
}
