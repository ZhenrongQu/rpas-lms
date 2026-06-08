import { z } from "zod";
import { verifyRegistrationEmail } from "../../../../../src/lib/auth/localAccount";

const VerifyEmailBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: Request): Promise<Response> {
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
