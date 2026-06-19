import { z } from "zod";
import { createPasswordResetToken } from "../../../../../src/lib/auth/localAccount";
import { sendPasswordResetLink } from "../../../../../src/lib/auth/delivery";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const Body = z.object({
  email: z.string({ required_error: "email_required" }).email("email_invalid"),
  locale: z.enum(["en", "zh"]).optional(),
}).strict();

// Always returns the same generic 200 for any well-formed email, whether or not
// an account exists — this is what prevents email enumeration. A reset link is
// only actually emailed when a matching account is found.
export async function POST(req: Request): Promise<Response> {
  // SEC-11: cap reset-link emails per IP. A 429 is existence-independent, so it
  // does not weaken the anti-enumeration guarantee below.
  const ipLimited = await enforceRateLimit(`forgot:ip:${clientIp(req)}`, {
    limit: 10,
    windowSec: 60 * 60,
    blockSec: 60 * 60,
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
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const fields: Record<string, string> = {};
    for (const [field, codes] of Object.entries(fieldErrors)) {
      if (codes && codes.length > 0) fields[field] = codes[0];
    }
    return Response.json({ error: "invalid body", fields }, { status: 400 });
  }

  const { email, locale = "en" } = parsed.data;

  // SEC-11: per-target cap (counted whether or not the account exists).
  const targetLimited = await enforceRateLimit(`forgot:email:${email.trim().toLowerCase()}`, {
    limit: 5,
    windowSec: 60 * 60,
    blockSec: 60 * 60,
  });
  if (targetLimited) return targetLimited;
  const result = await createPasswordResetToken({ email });
  if (result.ok) {
    const base = process.env.APP_URL ?? new URL(req.url).origin;
    const link =
      `${base}/${locale}/reset-password` +
      `?email=${encodeURIComponent(result.target)}&token=${encodeURIComponent(result.token)}`;
    try {
      await sendPasswordResetLink({ to: result.target, link });
    } catch (error) {
      // Swallow delivery errors so the response stays uniform whether or not an
      // account exists (a 500 here would leak existence). Logged for Sentry.
      console.error("Failed to send password reset link", error);
    }
  }

  return Response.json({ ok: true });
}
