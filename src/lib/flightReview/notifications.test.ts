import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture outgoing email instead of sending. Mock must be declared before the
// module under test is imported.
const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
vi.mock("../email/send", () => ({
  sendEmail: vi.fn(async (msg: { to: string; subject: string; text: string; html: string }) => {
    sent.push(msg);
  }),
}));

import { notifyBookingChange, escapeHtml } from "./notifications";

const slot = {
  startsAt: new Date("2026-07-01T17:00:00.000Z"),
  durationMin: 60,
  location: "Vancouver",
  examinerName: "Jane",
  examinerEmail: null,
  examinerPhone: null,
};

describe("escapeHtml (SEC-01)", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});

describe("notifyBookingChange — email HTML injection (SEC-01)", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("escapes a user-controlled student name in both student and admin emails", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";

    await notifyBookingChange({
      student: { email: "stu@example.com", name: "<script>alert(1)</script>" },
      locale: "en",
      slot,
      previousSlot: null,
      kind: "booked",
    });

    // student confirmation + admin notification
    expect(sent.length).toBe(2);
    for (const msg of sent) {
      expect(msg.html).not.toContain("<script>");
      expect(msg.html).toContain("&lt;script&gt;");
    }
  });
});
