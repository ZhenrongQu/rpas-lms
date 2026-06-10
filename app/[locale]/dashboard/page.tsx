import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MODULE_IDS } from '@/lib/content/types';
import ModuleCard from '@/components/dashboard/ModuleCard';
import ExamSidebar from '@/components/dashboard/ExamSidebar';
import ProgressRing from '@/components/dashboard/ProgressRing';
import { auth } from '../../../auth';
import ExamHistory from '@/components/dashboard/ExamHistory';
import { getModuleLessonCount, getCourseLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations();
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);
  const [basicTotal, advancedTotal] = await Promise.all([
    getCourseLessonCount('basic'),
    getCourseLessonCount('advanced'),
  ]);
  const basicModuleCounts = Object.fromEntries(
    await Promise.all(
      MODULE_IDS.map(async (id) => [id, await getModuleLessonCount('basic', id)] as const),
    ),
  ) as Record<string, number>;
  const basicModulePct = (id: string) => {
    const total = basicModuleCounts[id] ?? 0;
    if (total === 0) return 0;
    const done = [...completed].filter((l) => l.startsWith(`basic/${id}/`)).length;
    return Math.round((done / total) * 100);
  };
  const allTotal = basicTotal + advancedTotal;
  const overallPct = allTotal === 0 ? 0 : Math.round((completed.size / allTotal) * 100);
  const advancedDone = [...completed].filter((l) => l.startsWith('advanced/')).length;
  const advancedPct = advancedTotal === 0 ? 0 : Math.round((advancedDone / advancedTotal) * 100);

  return (
    <div className="dashboard-body">
      <ExamSidebar locale={locale} />

      <div className="dashboard-content">
        {/* Header */}
        <div>
          <div className="dash-callsign">{t('dashboard.certification')}</div>
          <div className="dash-title">{t('dashboard.title')}</div>
          <div className="dash-subtitle">// {t('dashboard.subtitle')}</div>
        </div>

        {/* Module grid */}
        <div className="modules-grid">
          <ModuleCard moduleId="intro" index={0} progress={100} href={`/${locale}/intro`} />
          {MODULE_IDS.map((id, i) => {
            const hasBasic = (basicModuleCounts[id] ?? 0) > 0;
            return (
              <ModuleCard
                key={id}
                moduleId={id}
                index={i + 1}
                progress={basicModulePct(id)}
                href={hasBasic ? `/${locale}/learn/basic/${id}` : undefined}
              />
            );
          })}
          <Link href={`/${locale}/learn/advanced`} className="mission-card advanced-track-card">
            <div className="card-id">// COURSE · 🔒 {t('learn.paid')}</div>
            <div className="card-icon">🎖️</div>
            <div className="card-name">{t('learn.advancedCourse')}</div>
            <div className="card-progress">
              <div className="prog-bar">
                <div className="prog-fill" style={{ width: `${advancedPct}%` }} />
              </div>
              <div className="prog-pct">{advancedPct}%</div>
            </div>
          </Link>
        </div>

        {/* Bottom: exam launcher + overall ring */}
        <div className="bottom-panel">
          <div className="hud-panel exam-launcher">
            <div className="hud-panel-glow" />
            <div className="launcher-title">{t('examLaunch.title')}</div>
            <div className="launcher-meta">
              Advanced Operations ·{' '}
              <span style={{ color: 'var(--cyan)' }}>50 questions</span> ·{' '}
              <span style={{ color: 'var(--cyan)' }}>60 min</span> · Pass threshold:{' '}
              <span style={{ color: 'var(--cyan)' }}>80%</span>
            </div>
            <Link href={`/${locale}/exam`} className="btn-launch">
              ▶ {t('dashboard.startExam')}
            </Link>
          </div>

          <div className="hud-panel overall-card">
            <ProgressRing pct={overallPct} size={120} label={`${overallPct}%`} sublabel="COMPLETE" />
            <div className="overall-label">// {t('dashboard.overallProgress')}<br/>{t('dashboard.certification').toUpperCase()}</div>
          </div>

          {userId ? (
            <ExamHistory userId={userId} locale={locale} />
          ) : (
            <div className="hud-panel history-card">
              <div className="breakdown-title">// {t('dashboard.history')}</div>
              <div className="history-empty">{t('dashboard.signInToSave')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
