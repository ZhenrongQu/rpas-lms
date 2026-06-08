import { z } from "zod";
import { sendVerificationCode } from "../../../../src/lib/auth/delivery";
import { registerLocalAccount } from "../../../../src/lib/auth/localAccount";
import { requestVerificationCode } from "../../../../src/lib/auth/verificationCode";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(24).optional(),
  phone: z.string().min(7).optional(),
}).strict();

function statusForError(error: unknown): number {
  return error instanceof Error && (
    error.message === "email_already_registered" ||
    error.message === "username_unavailable" ||
    error.message === "phone_unavailable"
  )
    ? 409
    : 400;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RegisterBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const user = await registerLocalAccount(parsed.data);
    const requested = await requestVerificationCode({
      channel: "email",
      target: user.email ?? parsed.data.email,
    });
    await sendVerificationCode({
      channel: "email",
      target: requested.target,
      code: requested.code,
    });

    return Response.json({ ok: true, emailVerificationRequired: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "registration_failed";
    return Response.json({ error: message }, { status: statusForError(error) });
  }
}
