import { z } from "zod";
import { createPasswordResetToken } from "../../../../../src/lib/auth/localAccount";
import { sendPasswordResetLink } from "../../../../../src/lib/auth/delivery";

const Body = z.object({
  email: z.string().email(),
  locale: z.enum(["en", "zh"]).optional(),
}).strict();

// Always returns the same generic 200 for any well-formed email, whether or not
// an account exists — this is what prevents email enumeration. A reset link is
// only actually emailed when a matching account is found.
export async function POST(req: Request): Promise<Response> {
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

  const { email, locale = "en" } = parsed.data;
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
