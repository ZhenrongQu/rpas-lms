import { deliverViaResend } from "./resend";

/**
 * Generic transactional email sender. Mirrors the auth verification-code
 * delivery pattern: outside production it logs to the console instead of
 * hitting Resend, so dev/test never sends real mail.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail({ to, subject, text, html }: EmailMessage): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[email] to=${to} subject="${subject}"\n${text}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@rpasacademy.ca";
  // deliverViaResend, not resend.emails.send: the SDK resolves rather than
  // throwing on a rejected send, and every caller here reads "did not throw" as
  // "delivered".
  await deliverViaResend(apiKey, { from: fromAddress, to, subject, text, html });
}
