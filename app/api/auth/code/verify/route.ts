import { z } from "zod";
import { createOrLoginVerifiedContactUser } from "../../../../../src/lib/auth/account";
import { verifyCode } from "../../../../../src/lib/auth/verificationCode";

const VerifyBody = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = VerifyBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const verified = await verifyCode(parsed.data);
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  const user = await createOrLoginVerifiedContactUser({
    channel: parsed.data.channel,
    target: verified.target,
  });

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      accessTier: user.accessTier,
    },
  });
}
