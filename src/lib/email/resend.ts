export type ResendMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Sends one message through Resend, and throws when Resend did not accept it.
 *
 * The SDK resolves with `{ data, error }` rather than rejecting, so a bare
 * `await resend.emails.send(...)` returns cleanly for a rejected send. Every
 * caller here treats "did not throw" as "delivered", which turned a failed send
 * into a silent success in two places that matter:
 *
 *   * Flight Review notifications recorded `status: SENT` for mail that was
 *     never accepted, so `hasFailedNotification` never fired and the resend
 *     affordance (PRD U12) was never offered — the failure was unrecoverable
 *     precisely because it was logged as a success.
 *   * Verification codes and password-reset links reported success, so the user
 *     was told to check their inbox for a message Resend had rejected.
 *
 * Returns the provider's message id, which is the only positive evidence that
 * anything was accepted.
 */
export async function deliverViaResend(apiKey: string, message: ResendMessage): Promise<string> {
  const { Resend } = await import("resend");
  const { data, error } = await new Resend(apiKey).emails.send(message);

  if (error) {
    throw new Error(`Resend rejected the message (${error.name ?? "error"}): ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend returned neither an error nor a message id");
  }
  return data.id;
}
