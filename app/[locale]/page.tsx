import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MODULE_IDS } from '@/lib/content/types';
import ModuleCard from '@/components/dashboard/ModuleCard';
import ExamSidebar from '@/components/dashboard/ExamSidebar';
import ProgressRing from '@/components/dashboard/ProgressRing';

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations();

  return (
    <div className="dashboard-body">
      <ExamSidebar />

      <div className="dashboard-content">
        {/* Header */}
        <div>
          <div className="dash-callsign">{t('dashboard.certification')}</div>
          <div className="dash-title">{t('dashboard.title')}</div>
          <div className="dash-subtitle">// {t('dashboard.subtitle')}</div>
        </div>

        {/* Module grid */}
        <div className="modules-grid">
          {MODULE_IDS.map((id) => (
            <ModuleCard key={id} moduleId={id} progress={0} />
          ))}
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
            <ProgressRing pct={0} size={120} label="0%" sublabel="COMPLETE" />
            <div className="overall-label">// {t('dashboard.overallProgress')}<br/>{t('dashboard.certification').toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
