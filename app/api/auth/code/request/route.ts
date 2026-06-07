import { z } from "zod";
import { sendVerificationCode } from "../../../../../src/lib/auth/delivery";
import { requestVerificationCode } from "../../../../../src/lib/auth/verificationCode";

const RequestBody = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const requested = await requestVerificationCode(parsed.data);
  await sendVerificationCode({
    channel: parsed.data.channel,
    target: requested.target,
    code: requested.code,
  });

  return Response.json({ ok: true });
}
