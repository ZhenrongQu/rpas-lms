import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  IconTrendingUp,
  IconBook,
  IconAward,
  IconCalendarCheck,
  IconArrowRight,
  IconCheck,
  IconShieldLock,
  IconChevronRight,
} from '@tabler/icons-react';
import { auth } from '../../../auth';
import { getCourseLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import { getResumeLesson } from '@/lib/lessons/resume';
import type { Course, RouteLocale } from '@/lib/lessons/types';
import { canBookFlightReview } from '@/lib/payments/entitlements';
import { getUserBooking } from '@/lib/flightReview/booking';
import { listUserExamHistory, type ExamHistoryItem } from '@/lib/exam/history';
import FlightReviewPanel from '@/components/dashboard/FlightReviewPanel';
import MockExamCard from '@/components/dashboard/MockExamCard';
import ProgressRing from '@/components/dashboard/ProgressRing';
import ChangePasswordForm from '@/components/dashboard/ChangePasswordForm';
import DeleteAccountForm from '@/components/dashboard/DeleteAccountForm';
import StudyAssistant from '@/components/dashboard/StudyAssistant';

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations();
  const session = await auth();

  if (!session?.user) redirect(`/${locale}/signin`);

  const userId = session.user.id ?? null;
  const userName = session.user.name || '—';
  const userEmail = session.user.email || '—';
  const accessTier = (session.user as { accessTier?: string }).accessTier ?? 'FREE';
  const isPaid = accessTier === 'PAID';
  const firstName = session.user.name?.trim().split(/\s+/)[0] || userEmail.split('@')[0];

  // All independent reads run in parallel — sequential awaits dominate the load
  // time when each query carries real DB round-trip latency. Flight-review status
  // and exam history are fetched once here and shared with the panel/card below.
  const [completedIds, basicTotal, advancedTotal, frEligible, frBooking, examItems] =
    await Promise.all([
      userId ? listCompletedLessonIds(userId) : Promise.resolve<string[]>([]),
      getCourseLessonCount('basic'),
      getCourseLessonCount('advanced'),
      userId ? canBookFlightReview(userId) : Promise.resolve(false),
      userId ? getUserBooking(userId) : Promise.resolve(null),
      userId ? listUserExamHistory(userId, 20) : Promise.resolve<ExamHistoryItem[]>([]),
    ]);

  const completed = new Set(completedIds);
  const basicDone = completedIds.filter((l) => l.startsWith('basic/')).length;
  const advancedDone = completedIds.filter((l) => l.startsWith('advanced/')).length;
  const basicPct = basicTotal === 0 ? 0 : Math.round((basicDone / basicTotal) * 100);
  const advancedPct = advancedTotal === 0 ? 0 : Math.round((advancedDone / advancedTotal) * 100);
  const totalLessons = basicTotal + advancedTotal;
  const totalDone = basicDone + advancedDone;
  const overallPct = totalLessons === 0 ? 0 : Math.round((totalDone / totalLessons) * 100);

  // Featured course + next lesson for the "Continue learning" hero. Depends on
  // progress, so it runs after the parallel fetch (one more lean query).
  const rl: RouteLocale = locale === 'zh' ? 'zh' : 'en';
  let featured: Course | null = null;
  if (basicDone < basicTotal) featured = 'basic';
  else if (isPaid && advancedDone < advancedTotal) featured = 'advanced';
  const resume = featured && userId ? await getResumeLesson(rl, featured, completed) : null;
  const featuredPct = featured === 'advanced' ? advancedPct : basicPct;
  const featuredDone = featured === 'advanced' ? advancedDone : basicDone;
  const featuredTotal = featured === 'advanced' ? advancedTotal : basicTotal;
  const featuredName = featured === 'advanced' ? t('learn.advancedCourse') : t('learn.basicCourse');

  const frStatus = frBooking
    ? t('dashboard.statusBooked')
    : frEligible
      ? t('dashboard.statusEligible')
      : t('dashboard.statusLocked');

  const submittedScores = examItems
    .filter((e) => e.submitted && e.scorePct !== null)
    .map((e) => e.scorePct as number);
  const bestPct = submittedScores.length ? Math.round(Math.max(...submittedScores) * 100) : null;

  return (
    <div className="dash-page">
      <div className="dash-page-inner">

        {/* ── Greeting ── */}
        <header className="dash-greet">
          <div>
            <h1 className="dash-greet-h">{t('dashboard.welcomeBack', { name: firstName })}</h1>
            <p className="dash-greet-sub">{t('dashboard.certProgressLine', { pct: overallPct })}</p>
          </div>
          <span className={`dash-tier-chip tier-${accessTier.toLowerCase()}`}>{accessTier}</span>
        </header>

        {/* ── KPI stats ── */}
        <div className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat-ico"><IconTrendingUp size={18} stroke={2} /></span>
            <span className="dash-stat-val">{overallPct}<small>%</small></span>
            <span className="dash-stat-label">{t('dashboard.overallProgress')}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-ico green"><IconBook size={18} stroke={2} /></span>
            <span className="dash-stat-val">{totalDone}<small> / {totalLessons}</small></span>
            <span className="dash-stat-label">{t('dashboard.lessonsComplete')}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat-ico amber"><IconAward size={18} stroke={2} /></span>
            <span className="dash-stat-val">
              {bestPct === null ? '—' : <>{bestPct}<small>%</small></>}
            </span>
            <span className="dash-stat-label">{t('dashboard.bestMock')}</span>
          </div>
          <div className="dash-stat">
            <span className={`dash-stat-ico${frBooking ? ' green' : ''}`}><IconCalendarCheck size={18} stroke={2} /></span>
            <span className="dash-stat-val sm">{frStatus}</span>
            <span className="dash-stat-label">{t('dashboard.flightReviewStat')}</span>
          </div>
        </div>

        {/* ── Continue learning ── */}
        {resume ? (
          <Link href={`/${locale}/learn/${resume.lessonId}`} className="dash-hero">
            <ProgressRing pct={featuredPct} size={108} label={`${featuredPct}%`} sublabel={featuredName} />
            <div className="dash-hero-body">
              <span className="dash-hero-kicker">{t('dashboard.continueLearning')}</span>
              <span className="dash-hero-title">{resume.title}</span>
              <span className="dash-hero-meta">
                {featuredName} · {featuredDone} / {featuredTotal} {t('dashboard.lessonsComplete')}
              </span>
            </div>
            <span className="btn-launch dash-hero-btn">
              {t('dashboard.continue')} <IconArrowRight size={16} stroke={2} />
            </span>
          </Link>
        ) : (
          <div className="dash-hero done">
            <span className="dash-hero-check"><IconCheck size={30} stroke={2.5} /></span>
            <div className="dash-hero-body">
              <span className="dash-hero-kicker">{t('dashboard.continueLearning')}</span>
              <span className="dash-hero-title">{t('dashboard.allCaughtUp')}</span>
              <span className="dash-hero-meta">{t('dashboard.courseCompleteHint')}</span>
            </div>
            {!isPaid ? (
              <Link href={`/${locale}/learn/advanced`} className="btn-launch dash-hero-btn">
                {t('dashboard.upgradeToPay')} <IconArrowRight size={16} stroke={2} />
              </Link>
            ) : (
              <Link href={`/${locale}/exam`} className="btn-launch dash-hero-btn">
                {t('dashboard.startExam')} <IconArrowRight size={16} stroke={2} />
              </Link>
            )}
          </div>
        )}

        {/* ── Your courses ── */}
        <section className="dash-block">
          <h2 className="dash-block-title">{t('dashboard.yourCourses')}</h2>
          <div className="dash-course-cards">
            {/* Basic */}
            <Link href={`/${locale}/my-course`} className="dash-course-card">
              <div className="dash-course-card-top">
                <span className="dash-course-card-name">{t('learn.basicCourse')}</span>
                <span className="dash-course-card-badge free">{t('learn.free')}</span>
              </div>
              <p className="dash-course-card-tagline">{t('learn.basicTagline')}</p>
              <div className="prog-bar"><div className="prog-fill" style={{ width: `${basicPct}%` }} /></div>
              <div className="dash-course-card-foot">
                <span className="dash-course-card-meta">{basicDone} / {basicTotal} {t('dashboard.lessonsComplete')}</span>
                <span className="dash-course-card-cta">
                  {basicTotal > 0 && basicDone >= basicTotal ? (
                    <><IconCheck size={15} stroke={2.5} /> {t('dashboard.courseComplete')}</>
                  ) : (
                    <>{t('dashboard.goToCourse')} <IconArrowRight size={15} stroke={2} /></>
                  )}
                </span>
              </div>
            </Link>

            {/* Advanced */}
            <Link href={`/${locale}/learn/advanced`} className="dash-course-card advanced">
              <div className="dash-course-card-top">
                <span className="dash-course-card-name">{t('learn.advancedCourse')}</span>
                <span className="dash-course-card-badge paid">{t('learn.paid')}</span>
              </div>
              <p className="dash-course-card-tagline">{t('learn.advancedTagline')}</p>
              <div className="prog-bar amber"><div className="prog-fill" style={{ width: `${advancedPct}%` }} /></div>
              <div className="dash-course-card-foot">
                <span className="dash-course-card-meta">{advancedDone} / {advancedTotal} {t('dashboard.lessonsComplete')}</span>
                <span className="dash-course-card-cta">
                  {!isPaid ? (
                    <>{t('dashboard.upgradeToPay')} <IconArrowRight size={15} stroke={2} /></>
                  ) : advancedTotal > 0 && advancedDone >= advancedTotal ? (
                    <><IconCheck size={15} stroke={2.5} /> {t('dashboard.courseComplete')}</>
                  ) : (
                    <>{t('dashboard.goToCourse')} <IconArrowRight size={15} stroke={2} /></>
                  )}
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* ── Flight review + Mock exam ── */}
        {userId && (
          <div className="dash-two-up">
            <FlightReviewPanel locale={locale} eligible={frEligible} booking={frBooking} />
            <MockExamCard items={examItems} locale={locale} />
          </div>
        )}

        {/* ── Study assistant (paid feature; free users see an upsell) ── */}
        {userId && <StudyAssistant locale={locale} isPaid={isPaid} />}

        {/* ── Account & security ── */}
        <details className="dash-account">
          <summary className="dash-account-summary">
            <span className="dash-account-ico"><IconShieldLock size={17} stroke={2} /></span>
            <span className="dash-account-title">{t('dashboard.accountSecurity')}</span>
            <IconChevronRight size={18} stroke={2} className="dash-account-chev" />
          </summary>
          <div className="dash-account-body">
            <div className="dash-account-fields">
              <div className="dash-field">
                <span className="profile-field-label">{t('dashboard.profileName')}</span>
                <span className="profile-field-value">{userName}</span>
              </div>
              <div className="dash-field">
                <span className="profile-field-label">{t('auth.email')}</span>
                <span className="profile-field-value">{userEmail}</span>
              </div>
              <div className="dash-field">
                <span className="profile-field-label">{t('dashboard.accessTier')}</span>
                <span className={`profile-tier tier-${accessTier.toLowerCase()}`}>{accessTier}</span>
              </div>
            </div>
            <div className="dash-account-pw">
              <div className="dash-account-pw-title">{t('dashboard.changePassword')}</div>
              <ChangePasswordForm />
            </div>
            <div className="dash-account-pw">
              <div className="dash-account-pw-title">{t('dashboard.deleteAccount')}</div>
              <DeleteAccountForm locale={locale} />
            </div>
          </div>
        </details>

      </div>
    </div>
  );
}
