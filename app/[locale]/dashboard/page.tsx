import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { getCourseLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import FlightReviewPanel from '@/components/dashboard/FlightReviewPanel';

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

  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);
  const [basicTotal, advancedTotal] = await Promise.all([
    getCourseLessonCount('basic'),
    getCourseLessonCount('advanced'),
  ]);
  const basicDone = [...completed].filter((l) => l.startsWith('basic/')).length;
  const advancedDone = [...completed].filter((l) => l.startsWith('advanced/')).length;
  const basicPct = basicTotal === 0 ? 0 : Math.round((basicDone / basicTotal) * 100);
  const advancedPct = advancedTotal === 0 ? 0 : Math.round((advancedDone / advancedTotal) * 100);

  const avatarInitial = (session.user.name?.[0] ?? session.user.email?.[0] ?? '?').toUpperCase();

  return (
    <div className="dash-page">
      <div className="dash-page-inner">

        {/* ── My Profile ── */}
        <section className="hud-panel dash-section">
          <div className="hud-panel-glow" />
          <div className="dash-section-title">{t('dashboard.myProfile')}</div>

          <div className="profile-row">
            <div className="profile-avatar">{avatarInitial}</div>
            <div className="profile-fields">
              <div className="profile-field">
                <span className="profile-field-label">{t('dashboard.profileName')}</span>
                <span className="profile-field-value">{userName}</span>
              </div>
              <div className="profile-field">
                <span className="profile-field-label">{t('auth.email')}</span>
                <span className="profile-field-value">{userEmail}</span>
              </div>
              <div className="profile-field">
                <span className="profile-field-label">{t('dashboard.accessTier')}</span>
                <span className={`profile-tier tier-${accessTier.toLowerCase()}`}>{accessTier}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── My Course ── */}
        <section className="hud-panel dash-section">
          <div className="hud-panel-glow" />
          <div className="dash-section-title">{t('dashboard.myCourse')}</div>

          <div className="dash-course-cards">
            {/* Basic */}
            <Link href={`/${locale}/my-course`} className="dash-course-card">
              <div className="dash-course-card-top">
                <span className="dash-course-card-badge free">{t('learn.free')}</span>
                <span className="dash-course-card-name">{t('learn.basicCourse')}</span>
              </div>
              <div className="dash-course-card-progress">
                <div className="prog-bar">
                  <div className="prog-fill" style={{ width: `${basicPct}%` }} />
                </div>
                <span className="prog-pct">{basicPct}%</span>
              </div>
              <div className="dash-course-card-meta">
                {basicDone} / {basicTotal} {t('dashboard.lessonsComplete')}
              </div>
              <div className="dash-course-card-cta">{t('dashboard.goToCourse')} →</div>
            </Link>

            {/* Advanced */}
            <Link href={`/${locale}/learn/advanced`} className="dash-course-card advanced">
              <div className="dash-course-card-top">
                <span className="dash-course-card-badge paid">{t('learn.paid')}</span>
                <span className="dash-course-card-name">{t('learn.advancedCourse')}</span>
              </div>
              <div className="dash-course-card-progress">
                <div className="prog-bar">
                  <div className="prog-fill" style={{ width: `${advancedPct}%` }} />
                </div>
                <span className="prog-pct">{advancedPct}%</span>
              </div>
              <div className="dash-course-card-meta">
                {advancedDone} / {advancedTotal} {t('dashboard.lessonsComplete')}
              </div>
              <div className="dash-course-card-cta">
                {accessTier === 'FREE' ? t('dashboard.upgradeToPay') : t('dashboard.goToCourse')} →
              </div>
            </Link>
          </div>
        </section>

        {/* ── Flight Review ── */}
        {userId && <FlightReviewPanel userId={userId} locale={locale} />}

      </div>
    </div>
  );
}
