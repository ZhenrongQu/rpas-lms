import { listUserExamHistory } from "../exam/history";
import type { AccessTier } from "../exam/access";
import { getUserBooking } from "../flightReview/booking";
import { getCourseLessonCount } from "../lessons/catalog";
import { listCompletedLessonIds } from "../lessons/progress";
import { getResumeLesson } from "../lessons/resume";
import type { Course, RouteLocale } from "../lessons/types";
import { canBookFlightReview } from "../payments/entitlements";

type Input = {
  userId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
};

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export async function getMobileDashboard({ userId, locale, accessTier }: Input) {
  const [completedIds, basicTotal, advancedTotal, examItems, frEligible, frBooking] =
    await Promise.all([
      listCompletedLessonIds(userId),
      getCourseLessonCount("basic"),
      getCourseLessonCount("advanced"),
      listUserExamHistory(userId, 5),
      canBookFlightReview(userId),
      getUserBooking(userId),
    ]);

  const completed = new Set(completedIds);
  const basicDone = completedIds.filter((id) => id.startsWith("basic/")).length;
  const advancedDone = completedIds.filter((id) => id.startsWith("advanced/")).length;
  const basicPct = pct(basicDone, basicTotal);
  const advancedPct = pct(advancedDone, advancedTotal);
  const totalDone = basicDone + advancedDone;
  const totalLessons = basicTotal + advancedTotal;

  let resumeCourse: Course | null = null;
  if (basicDone < basicTotal) resumeCourse = "basic";
  else if (accessTier === "PAID" && advancedDone < advancedTotal) resumeCourse = "advanced";

  const resumeLesson = resumeCourse ? await getResumeLesson(locale, resumeCourse, completed) : null;

  const submittedScores = examItems
    .filter((item) => item.submitted && item.scorePct !== null)
    .map((item) => Math.round((item.scorePct as number) * 100));

  return {
    progress: {
      overallPct: pct(totalDone, totalLessons),
      totalDone,
      totalLessons,
      basic: { done: basicDone, total: basicTotal, pct: basicPct },
      advanced: {
        done: advancedDone,
        total: advancedTotal,
        pct: advancedPct,
        locked: accessTier !== "PAID",
      },
    },
    resume:
      resumeLesson && resumeCourse
        ? {
            course: resumeCourse,
            lessonId: resumeLesson.lessonId,
            title: resumeLesson.title,
            courseTitle: resumeCourse === "basic" ? "Basic" : "Advanced",
            pct: resumeCourse === "basic" ? basicPct : advancedPct,
          }
        : null,
    mockExam: {
      bestPct: submittedScores.length ? Math.max(...submittedScores) : null,
      recentCount: examItems.length,
    },
    flightReview: {
      status: frBooking ? "booked" : frEligible ? "eligible" : "locked",
      booking: frBooking,
    },
  };
}
