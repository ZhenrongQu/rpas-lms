import { describe, expect, it, vi } from "vitest";
import { getMobileDashboard } from "./dashboard";
import { listCompletedLessonIds } from "../lessons/progress";
import { getCourseLessonCount } from "../lessons/catalog";
import { getResumeLesson } from "../lessons/resume";
import { listUserExamHistory } from "../exam/history";
import { canBookFlightReview } from "../payments/entitlements";
import { getUserBooking } from "../flightReview/booking";

vi.mock("../lessons/progress", () => ({ listCompletedLessonIds: vi.fn() }));
vi.mock("../lessons/catalog", () => ({ getCourseLessonCount: vi.fn() }));
vi.mock("../lessons/resume", () => ({ getResumeLesson: vi.fn() }));
vi.mock("../exam/history", () => ({ listUserExamHistory: vi.fn() }));
vi.mock("../payments/entitlements", () => ({ canBookFlightReview: vi.fn() }));
vi.mock("../flightReview/booking", () => ({ getUserBooking: vi.fn() }));

describe("getMobileDashboard", () => {
  it("returns progress, resume lesson, exam summary, and flight-review status", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue(["basic/air-law/intro"]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(4).mockResolvedValueOnce(6);
    vi.mocked(getResumeLesson).mockResolvedValue({
      lessonId: "basic/weather/clouds",
      title: "Clouds",
    });
    vi.mocked(listUserExamHistory).mockResolvedValue([
      {
        id: "exam_1",
        certLevel: "BASIC",
        submitted: true,
        scorePct: 0.82,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(canBookFlightReview).mockResolvedValue(false);
    vi.mocked(getUserBooking).mockResolvedValue(null);

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
});
