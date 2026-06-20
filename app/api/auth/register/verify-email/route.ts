import { z } from "zod";
import { verifyRegistrationEmail } from "../../../../../src/lib/auth/localAccount";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const VerifyEmailBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: Request): Promise<Response> {
  // SEC: cap code-verification attempts per IP. The per-code 5-attempt cap only
  // protects a single active code; re-issuing fresh codes resets it, so without
  // an IP cap the 6-digit space is under-throttled at the HTTP layer.
  const ipLimited = await enforceRateLimit(`verify-email:ip:${clientIp(req)}`, {
    limit: 30,
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

  const parsed = VerifyEmailBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const verified = await verifyRegistrationEmail(parsed.data);
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  return Response.json({ ok: true });
}
