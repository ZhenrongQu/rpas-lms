import type { FlightReviewSlot } from "@prisma/client";
import { prisma } from "../db";
import { sendEmail } from "../email/send";
import { deliveryErrorMessage, recordNotificationAttempt } from "../email/log";
import { formatSlotDateTime } from "./format";

/** Escapes HTML so user-controlled text (e.g. a student's display name) cannot
 *  inject markup/links into the notification emails. SEC-01. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Slot = Pick<
  FlightReviewSlot,
  "startsAt" | "durationMin" | "location" | "examinerName" | "examinerEmail" | "examinerPhone"
>;

type Student = { email: string; name: string };
type ChangeKind = "booked" | "rescheduled";

/** Which booking this email is about, so a failure can be found and resent. */
type SendContext = { kind: string; bookingId?: string | null; customerId?: string | null };

/**
 * Best-effort send: a bounced email must never roll back a committed booking —
 * the booking is the product, the email is a courtesy (PRD U12).
 *
 * But swallowing the failure silently makes it unrecoverable: nobody knows to
 * resend. Every attempt is recorded, so a failure is queryable and the resend
 * endpoints have something to act on. Logging is itself best effort — a logging
 * outage must not become a booking outage.
 */
async function safeSend(
  message: Parameters<typeof sendEmail>[0],
  ctx: SendContext,
): Promise<boolean> {
  let error: string | null = null;
  try {
    await sendEmail(message);
  } catch (err) {
    error = deliveryErrorMessage(err);
    console.error(`[flight-review] email failed (to=${message.to}):`, err);
  }

  await recordNotificationAttempt({
    kind: ctx.kind,
    recipient: message.to,
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
    error,
  });
  return error === null;
}

/** Failed sends for a booking, so the UI can offer a resend where it matters. */
export async function hasFailedNotification(bookingId: string): Promise<boolean> {
  const failed = await prisma.notificationLog.findFirst({
    where: { bookingId, status: "FAILED" },
    select: { id: true },
  });
  return failed !== null;
}

function examinerLine(slot: Slot): string {
  const contact = [slot.examinerEmail, slot.examinerPhone].filter(Boolean).join(", ");
  return contact ? `${slot.examinerName} (${contact})` : slot.examinerName;
}

function studentDetails(slot: Slot, locale: string): { en: string; zh: string } {
  const when = formatSlotDateTime(slot.startsAt, locale);
  return {
    en: `Date & time: ${when}\nDuration: ${slot.durationMin} min\nLocation: ${slot.location}\nExaminer: ${examinerLine(slot)}`,
    zh: `时间：${when}\n时长：${slot.durationMin} 分钟\n地点：${slot.location}\n考官：${examinerLine(slot)}`,
  };
}

function adminEmail(): string | null {
  return process.env.ADMIN_NOTIFICATION_EMAIL ?? null;
}

/** Confirmation to the student + notification to the admin for a new or moved booking. */
export async function notifyBookingChange(opts: {
  student: Student;
  locale: string;
  slot: Slot;
  previousSlot: Slot | null;
  kind: ChangeKind;
  bookingId?: string | null;
  customerId?: string | null;
  /** Whether the STUDENT's copy was accepted. The admin copy is a courtesy to
   *  ops and is recorded either way; it must not decide what the student is
   *  told about their own email. Booking callers ignore this — a bounced email
   *  must never roll back a committed booking. */
}): Promise<boolean> {
  const { student, locale, slot, kind } = opts;
  const ctx = {
    kind: `flight_review_${kind}`,
    bookingId: opts.bookingId,
    customerId: opts.customerId,
  };
  const isZh = locale === "zh";
  const details = studentDetails(slot, locale);

  const studentSubject = isZh
    ? kind === "rescheduled"
      ? "您的飞行考核预约已改期"
      : "您的飞行考核预约已确认"
    : kind === "rescheduled"
      ? "Your Flight Review has been rescheduled"
      : "Your Flight Review is confirmed";

  const studentBody = isZh
    ? `${student.name} 您好，\n\n您的飞行考核预约详情如下：\n\n${details.zh}\n\n如需取消或改期，请登录学员中心操作。`
    : `Hi ${student.name},\n\nYour Flight Review appointment is confirmed:\n\n${details.en}\n\nTo cancel or reschedule, visit your dashboard.`;

  const delivered = await safeSend(
    {
      to: student.email,
      subject: studentSubject,
      text: studentBody,
      html: `<p>${escapeHtml(studentBody).replace(/\n/g, "<br>")}</p>`,
    },
    ctx,
  );

  const admin = adminEmail();
  if (admin) {
    const change = kind === "rescheduled" && opts.previousSlot
      ? `\nPreviously: ${formatSlotDateTime(opts.previousSlot.startsAt, "en")} @ ${opts.previousSlot.location}`
      : "";
    const adminBody = `Student: ${student.name} <${student.email}>\nAction: ${kind}\n\n${studentDetails(slot, "en").en}${change}`;
    await safeSend(
      {
        to: admin,
        subject: `[Flight Review] ${student.name} ${kind} — ${formatSlotDateTime(slot.startsAt, "en")}`,
        text: adminBody,
        html: `<p>${escapeHtml(adminBody).replace(/\n/g, "<br>")}</p>`,
      },
      ctx,
    );
  }

  return delivered;
}

/** Cancellation notice to the student + admin. */
export async function notifyCancellation(opts: {
  student: Student;
  locale: string;
  slot: Slot;
  bookingId?: string | null;
  customerId?: string | null;
}): Promise<void> {
  const { student, locale, slot } = opts;
  const ctx = {
    kind: "flight_review_cancelled",
    bookingId: opts.bookingId,
    customerId: opts.customerId,
  };
  const isZh = locale === "zh";
  const details = studentDetails(slot, locale);

  const studentBody = isZh
    ? `${student.name} 您好，\n\n您已取消以下飞行考核预约：\n\n${details.zh}\n\n如需重新预约，请登录学员中心。`
    : `Hi ${student.name},\n\nYour Flight Review appointment has been cancelled:\n\n${details.en}\n\nYou can book a new slot from your dashboard.`;

  await safeSend(
    {
      to: student.email,
      subject: isZh ? "您的飞行考核预约已取消" : "Your Flight Review has been cancelled",
      text: studentBody,
      html: `<p>${escapeHtml(studentBody).replace(/\n/g, "<br>")}</p>`,
    },
    ctx,
  );

  const admin = adminEmail();
  if (admin) {
    const adminBody = `Student: ${student.name} <${student.email}>\nAction: cancelled\n\n${studentDetails(slot, "en").en}`;
    await safeSend(
      {
        to: admin,
        subject: `[Flight Review] ${student.name} cancelled — ${formatSlotDateTime(slot.startsAt, "en")}`,
        text: adminBody,
        html: `<p>${escapeHtml(adminBody).replace(/\n/g, "<br>")}</p>`,
      },
      ctx,
    );
  }
}

/**
 * Re-sends the confirmation for an existing booking (PRD U12).
 *
 * One code path for both the student's "email it again" button and the admin's,
 * so a resend can never differ from the original. Returns false when the booking
 * is gone or the customer has no address to send to.
 */
/**
 * The U12 recovery path. It reports what actually happened, because a resend
 * that answers "sent" for a message the provider rejected is DEF-004 all over
 * again — this time on the affordance that exists to recover from it.
 */
export type ResendOutcome = "sent" | "delivery_failed" | "no_address";

export async function resendBookingConfirmation(
  bookingId: string,
  locale: string,
): Promise<ResendOutcome> {
  const booking = await prisma.flightReviewBooking.findUnique({
    where: { id: bookingId },
    include: { slot: true, customer: { select: { email: true, displayName: true } } },
  });
  if (!booking?.customer.email) return "no_address";

  const delivered = await notifyBookingChange({
    student: {
      email: booking.customer.email,
      name: booking.customer.displayName ?? booking.customer.email,
    },
    locale,
    slot: booking.slot,
    previousSlot: null,
    kind: "booked",
    bookingId: booking.id,
    customerId: booking.customerId,
  });
  return delivered ? "sent" : "delivery_failed";
}
