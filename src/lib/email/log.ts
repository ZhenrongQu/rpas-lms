import { prisma } from "../db";

/**
 * Records one delivery attempt in NotificationLog.
 *
 * DEF-004 made the sender tell the truth about a rejected send; that only helps
 * where the truth is kept. The Flight Review path already recorded every
 * attempt, which is what makes `hasFailedNotification` — and therefore the U12
 * resend affordance — possible. The two auth paths kept nothing: a rejected
 * verification code or reset link existed only as a console line, so nobody
 * could tell that account recovery was down, or for whom.
 *
 * Best effort by construction: a logging outage must not become a booking or a
 * registration outage. Never throws.
 */
export async function recordNotificationAttempt(attempt: {
  kind: string;
  recipient: string;
  bookingId?: string | null;
  customerId?: string | null;
  /** Absent for a delivered message; present for one the provider rejected. */
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        kind: attempt.kind,
        recipient: attempt.recipient,
        bookingId: attempt.bookingId ?? null,
        customerId: attempt.customerId ?? null,
        status: attempt.error ? "FAILED" : "SENT",
        error: attempt.error?.slice(0, 500) ?? null,
      },
    });
  } catch (logErr) {
    console.error("[notifications] could not record delivery attempt:", logErr);
  }
}

/** The message shape NotificationLog stores, from whatever a sender threw. */
export function deliveryErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
