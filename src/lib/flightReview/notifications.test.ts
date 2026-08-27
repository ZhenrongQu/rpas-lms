import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db";

// Real Resend is never reachable in tests; this double lets a case choose whether
// the send succeeds or blows up.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../email/send", () => ({ sendEmail: sendMock }));

import {
  hasFailedNotification,
  notifyBookingChange,
  resendBookingConfirmation,
} from "./notifications";
import { bookSlot } from "./booking";
import { grantCredit } from "./credits";

const USER = "notify-user";

async function reset() {
  await prisma.notificationLog.deleteMany();
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.customer.deleteMany({ where: { id: USER } });
}

async function bookedSlot(): Promise<string> {
  await grantCredit(USER, "course_bundle");
  const slot = await prisma.flightReviewSlot.create({
    data: {
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      location: "YVR",
      examinerName: "Pat",
      examinerEmail: "pat@examiner.test",
    },
  });
  const result = await bookSlot(USER, slot.id);
  return result.ok ? result.booking.id : "";
}

describe("flight review notifications (PRD U12)", () => {
  beforeEach(async () => {
    await reset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await prisma.customer.create({
      data: { id: USER, email: "notify@test.local", displayName: "Nora" },
    });
  });
  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  it("records a successful send", async () => {
    const bookingId = await bookedSlot();

    await resendBookingConfirmation(bookingId, "en");

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { bookingId } });
    expect(log.status).toBe("SENT");
    expect(log.recipient).toBe("notify@test.local");
    expect(log.kind).toBe("flight_review_booked");
  });

  it("keeps the booking and records the failure when delivery throws", async () => {
    sendMock.mockRejectedValue(new Error("smtp exploded"));

    const bookingId = await bookedSlot();
    await resendBookingConfirmation(bookingId, "en");

    // The booking is the product; the email is a courtesy. It must survive.
    const booking = await prisma.flightReviewBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe("BOOKED");

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { bookingId } });
    expect(log.status).toBe("FAILED");
    expect(log.error).toContain("smtp exploded");
    expect(await hasFailedNotification(bookingId)).toBe(true);
  });

  it("reports no failure for a booking whose emails all went out", async () => {
    const bookingId = await bookedSlot();
    await resendBookingConfirmation(bookingId, "en");

    expect(await hasFailedNotification(bookingId)).toBe(false);
  });

  it("a resend sends the same confirmation again and logs a second attempt", async () => {
    const bookingId = await bookedSlot();

    await resendBookingConfirmation(bookingId, "en");
    await resendBookingConfirmation(bookingId, "en");

    expect(await prisma.notificationLog.count({ where: { bookingId } })).toBe(2);
    const [first, second] = sendMock.mock.calls.map((c) => c[0].subject);
    expect(second).toBe(first);
  });

  it("reports failure rather than throwing for an unknown booking", async () => {
    expect(await resendBookingConfirmation("no-such-booking", "en")).toBe("no_address");
  });

  // DEF-004, third half. safeSend swallows the delivery error by design — a
  // bounced email must not roll back a committed booking — but the resend path
  // then reported "sent" for a message the provider had rejected. That is the
  // original defect wearing the affordance built to recover from it.
  it("tells a resend that the message was rejected, not that it was sent", async () => {
    const bookingId = await bookedSlot();
    sendMock.mockRejectedValue(new Error("Resend rejected the message: API key is invalid"));

    expect(await resendBookingConfirmation(bookingId, "en")).toBe("delivery_failed");
  });

  it("reports a genuinely delivered resend as sent", async () => {
    const bookingId = await bookedSlot();

    expect(await resendBookingConfirmation(bookingId, "en")).toBe("sent");
  });

  // The admin copy is a courtesy to ops and is recorded either way; it must not
  // decide what the student is told about their own confirmation.
  it("still reports sent when only the admin copy is rejected", async () => {
    const bookingId = await bookedSlot();
    const previous = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = "ops@test.local";
    sendMock.mockReset();
    sendMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("admin copy bounced"));

    const outcome = await resendBookingConfirmation(bookingId, "en");

    if (previous === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else process.env.ADMIN_NOTIFICATION_EMAIL = previous;
    expect(outcome).toBe("sent");
  });

  it("does not let a logging outage break the notification path", async () => {
    const bookingId = await bookedSlot();
    const spy = vi
      .spyOn(prisma.notificationLog, "create")
      .mockRejectedValue(new Error("log table gone"));

    await expect(
      notifyBookingChange({
        student: { email: "notify@test.local", name: "Nora" },
        locale: "en",
        slot: await prisma.flightReviewSlot.findFirstOrThrow(),
        previousSlot: null,
        kind: "booked",
        bookingId,
        customerId: USER,
      }),
      // Still reports the send as delivered: the message did go out, it is only
      // the record of it that was lost.
    ).resolves.toBe(true);

    spy.mockRestore();
  });
});
