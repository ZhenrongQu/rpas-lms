import type { FlightReviewSlot } from "@prisma/client";
import { sendEmail } from "../email/send";
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

/** Best-effort send: a bounced email must never roll back a committed booking. */
async function safeSend(message: Parameters<typeof sendEmail>[0]): Promise<void> {
  try {
    await sendEmail(message);
  } catch (err) {
    console.error(`[flight-review] email failed (to=${message.to}):`, err);
  }
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
}): Promise<void> {
  const { student, locale, slot, kind } = opts;
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

  await safeSend({
    to: student.email,
    subject: studentSubject,
    text: studentBody,
    html: `<p>${escapeHtml(studentBody).replace(/\n/g, "<br>")}</p>`,
  });

  const admin = adminEmail();
  if (admin) {
    const change = kind === "rescheduled" && opts.previousSlot
      ? `\nPreviously: ${formatSlotDateTime(opts.previousSlot.startsAt, "en")} @ ${opts.previousSlot.location}`
      : "";
    const adminBody = `Student: ${student.name} <${student.email}>\nAction: ${kind}\n\n${studentDetails(slot, "en").en}${change}`;
    await safeSend({
      to: admin,
      subject: `[Flight Review] ${student.name} ${kind} — ${formatSlotDateTime(slot.startsAt, "en")}`,
      text: adminBody,
      html: `<p>${escapeHtml(adminBody).replace(/\n/g, "<br>")}</p>`,
    });
  }
}

/** Cancellation notice to the student + admin. */
export async function notifyCancellation(opts: {
  student: Student;
  locale: string;
  slot: Slot;
}): Promise<void> {
  const { student, locale, slot } = opts;
  const isZh = locale === "zh";
  const details = studentDetails(slot, locale);

  const studentBody = isZh
    ? `${student.name} 您好，\n\n您已取消以下飞行考核预约：\n\n${details.zh}\n\n如需重新预约，请登录学员中心。`
    : `Hi ${student.name},\n\nYour Flight Review appointment has been cancelled:\n\n${details.en}\n\nYou can book a new slot from your dashboard.`;

  await safeSend({
    to: student.email,
    subject: isZh ? "您的飞行考核预约已取消" : "Your Flight Review has been cancelled",
    text: studentBody,
    html: `<p>${escapeHtml(studentBody).replace(/\n/g, "<br>")}</p>`,
  });

  const admin = adminEmail();
  if (admin) {
    const adminBody = `Student: ${student.name} <${student.email}>\nAction: cancelled\n\n${studentDetails(slot, "en").en}`;
    await safeSend({
      to: admin,
      subject: `[Flight Review] ${student.name} cancelled — ${formatSlotDateTime(slot.startsAt, "en")}`,
      text: adminBody,
      html: `<p>${escapeHtml(adminBody).replace(/\n/g, "<br>")}</p>`,
    });
  }
}
