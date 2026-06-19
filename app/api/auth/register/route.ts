import { z } from "zod";
import { sendVerificationCode } from "../../../../src/lib/auth/delivery";
import { registerLocalAccount } from "../../../../src/lib/auth/localAccount";
import { requestVerificationCode } from "../../../../src/lib/auth/verificationCode";

// Each rule's message is a stable error code (not prose) so the client can map
// it to a localized hint via the `auth.err.*` i18n keys.
const RegisterBody = z.object({
  email: z.string({ required_error: "email_required" }).email("email_invalid"),
  password: z.string({ required_error: "password_required" }).min(8, "password_length").max(72, "password_length"),
  username: z.string().min(6, "username_length").max(24, "username_length").regex(/^[a-zA-Z0-9]+$/, "username_charset").optional(),
  phone: z.string().min(7, "phone_length").optional(),
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
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const fields: Record<string, string> = {};
    for (const [field, codes] of Object.entries(fieldErrors)) {
      if (codes && codes.length > 0) fields[field] = codes[0];
    }
    return Response.json({ error: "invalid body", fields }, { status: 400 });
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
