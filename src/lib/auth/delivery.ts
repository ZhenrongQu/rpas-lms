import type { VerificationChannel } from "./types";

export async function sendVerificationCode({
  channel,
  target,
  code,
}: {
  channel: VerificationChannel;
  target: string;
  code: string;
}): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth-code] ${channel}:${target} code=${code}`);
    return;
  }

  if (channel === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const fromAddress = process.env.EMAIL_FROM ?? "noreply@rpasacademy.ca";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: fromAddress,
      to: target,
      subject: "Your PACIFIC DRONE verification code",
      text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
      html: `<p>Your PACIFIC DRONE verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`,
    });
    return;
  }

  // phone (SMS) — not yet implemented, log for now
  console.info(`[auth-code] ${channel}:${target} code generated (SMS not configured)`);
}
