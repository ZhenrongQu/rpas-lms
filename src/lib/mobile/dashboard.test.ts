import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMobileDashboard } from "./dashboard";
import { listCompletedLessonIds } from "../lessons/progress";
import { getCourseLessonCount } from "../lessons/catalog";
import { getResumeLesson } from "../lessons/resume";
import { listUserExamHistory } from "../exam/history";
import { canBookFlightReview } from "../payments/entitlements";
import { getUserBooking } from "../flightReview/booking";
import type { ExamHistoryItem } from "../exam/history";
import type { BookingWithSlot } from "../flightReview/booking";

vi.mock("../lessons/progress", () => ({ listCompletedLessonIds: vi.fn() }));
vi.mock("../lessons/catalog", () => ({ getCourseLessonCount: vi.fn() }));
vi.mock("../lessons/resume", () => ({ getResumeLesson: vi.fn() }));
vi.mock("../exam/history", () => ({ listUserExamHistory: vi.fn() }));
vi.mock("../payments/entitlements", () => ({ canBookFlightReview: vi.fn() }));
vi.mock("../flightReview/booking", () => ({ getUserBooking: vi.fn() }));

function examHistoryItem(overrides: Partial<ExamHistoryItem> = {}): ExamHistoryItem {
  return {
    id: "exam_1",
    certLevel: "BASIC",
    submitted: true,
    scorePct: 0.82,
    passed: true,
    startedAt: new Date("2026-06-24T00:00:00.000Z").getTime(),
    ...overrides,
  };
}

function bookingFixture(): BookingWithSlot {
  return {
    id: "booking_1",
    customerId: "user_1",
    slotId: "slot_1",
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    updatedAt: new Date("2026-06-21T00:00:00.000Z"),
    slot: {
      id: "slot_1",
      startsAt: new Date("2026-07-01T17:00:00.000Z"),
      durationMin: 60,
      location: "Vancouver",
      examinerName: "Jane",
      examinerEmail: "jane@example.com",
      examinerPhone: "555-0100",
      notes: "Internal note",
      status: "ACTIVE",
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-11T00:00:00.000Z"),
    },
  } as BookingWithSlot;
}

describe("getMobileDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCompletedLessonIds).mockResolvedValue([]);
    vi.mocked(getCourseLessonCount).mockResolvedValue(0);
    vi.mocked(getResumeLesson).mockResolvedValue(null);
    vi.mocked(listUserExamHistory).mockResolvedValue([]);
    vi.mocked(canBookFlightReview).mockResolvedValue(false);
    vi.mocked(getUserBooking).mockResolvedValue(null);
  });

  it("returns progress, resume lesson, exam summary, and locked flight-review status for a free user", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue(["basic/air-law/intro"]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(4).mockResolvedValueOnce(6);
    vi.mocked(getResumeLesson).mockResolvedValue({
      lessonId: "basic/weather/clouds",
      title: "Clouds",
    });
    vi.mocked(listUserExamHistory).mockResolvedValue([examHistoryItem()]);

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "FREE",
      }),
    ).resolves.toEqual({
      progress: {
        overallPct: 10,
        totalDone: 1,
        totalLessons: 10,
        basic: { done: 1, total: 4, pct: 25 },
        advanced: { done: 0, total: 6, pct: 0, locked: true },
      },
      resume: {
        course: "basic",
        lessonId: "basic/weather/clouds",
        title: "Clouds",
        courseTitle: "Basic",
        pct: 25,
      },
      mockExam: {
        bestPct: 82,
        recentCount: 1,
      },
      flightReview: {
        status: "locked",
        booking: null,
      },
    });
  });

  it("resumes advanced for a paid user after basic is complete", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue([
      "basic/air-law/intro",
      "basic/weather/clouds",
      "advanced/nav/intro",
    ]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    vi.mocked(getResumeLesson).mockResolvedValue({
      lessonId: "advanced/ops/briefing",
      title: "Briefing",
    });

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toMatchObject({
      progress: {
        overallPct: 60,
        totalDone: 3,
        totalLessons: 5,
        basic: { done: 2, total: 2, pct: 100 },
        advanced: { done: 1, total: 3, pct: 33, locked: false },
      },
      resume: {
        course: "advanced",
        lessonId: "advanced/ops/briefing",
        title: "Briefing",
        courseTitle: "Advanced",
        pct: 33,
      },
    });
    expect(getResumeLesson).toHaveBeenCalledWith("en", "advanced", new Set([
      "basic/air-law/intro",
      "basic/weather/clouds",
      "advanced/nav/intro",
    ]));
  });

  it("returns null resume and handles zero totals without divide-by-zero", async () => {
    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "FREE",
      }),
    ).resolves.toMatchObject({
      progress: {
        overallPct: 0,
        totalDone: 0,
        totalLessons: 0,
        basic: { done: 0, total: 0, pct: 0 },
        advanced: { done: 0, total: 0, pct: 0, locked: true },
      },
      resume: null,
      mockExam: {
        bestPct: null,
        recentCount: 0,
      },
    });
    expect(getResumeLesson).not.toHaveBeenCalled();
  });

  it("returns null best exam pct when no submitted exam has a score", async () => {
    vi.mocked(listUserExamHistory).mockResolvedValue([
      examHistoryItem({ id: "exam_1", submitted: false, scorePct: null, passed: null }),
      examHistoryItem({ id: "exam_2", submitted: false, scorePct: 0.91, passed: null }),
      examHistoryItem({ id: "exam_3", submitted: true, scorePct: null, passed: null }),
    ]);

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "FREE",
      }),
    ).resolves.toMatchObject({
      mockExam: {
        bestPct: null,
        recentCount: 3,
      },
    });
  });

  it("returns an eligible flight-review status without exposing a booking model", async () => {
    vi.mocked(canBookFlightReview).mockResolvedValue(true);

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toMatchObject({
      flightReview: {
        status: "eligible",
        booking: null,
      },
    });
  });

  it("returns a booked flight-review status with a narrow booking DTO", async () => {
    vi.mocked(getUserBooking).mockResolvedValue(bookingFixture());

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        flightReview: {
          status: "booked",
          booking: {
            id: "booking_1",
            startsAt: "2026-07-01T17:00:00.000Z",
            durationMin: 60,
            location: "Vancouver",
            examinerName: "Jane",
          },
        },
      }),
    );

    const result = await getMobileDashboard({
      userId: "user_1",
      locale: "en",
      accessTier: "PAID",
    });
    expect(result.flightReview.booking).not.toHaveProperty("customerId");
    expect(result.flightReview.booking).not.toHaveProperty("slotId");
    expect(result.flightReview.booking).not.toHaveProperty("slot");
  });

  it("localizes courseTitle for zh locale", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue(["basic/air-law/intro"]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(4).mockResolvedValueOnce(6);
    vi.mocked(getResumeLesson).mockResolvedValue({
      lessonId: "basic/weather/clouds",
      title: "云",
    });

    await expect(
      getMobileDashboard({
        userId: "user_1",
        locale: "zh",
        accessTier: "FREE",
      }),
    ).resolves.toMatchObject({
      resume: {
        course: "basic",
        lessonId: "basic/weather/clouds",
        title: "云",
        courseTitle: "基础",
        pct: 25,
      },
    });
  });
});
