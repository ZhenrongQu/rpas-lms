import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MODULE_IDS } from '@/lib/content/types';
import { getModuleLessonCount, getCourseLessonCount } from '@/lib/lessons/catalog';
import { listCompletedLessonIds } from '@/lib/lessons/progress';
import { auth } from '../../../auth';

export default async function ExamSidebar({ locale }: { locale: string }) {
  const t = await getTranslations();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const completed = new Set(userId ? await listCompletedLessonIds(userId) : []);

  const basicTotal = getCourseLessonCount('basic');
  const basicDone = [...completed].filter((l) => l.startsWith('basic/')).length;
  const overall = basicTotal === 0 ? 0 : Math.round((basicDone / basicTotal) * 100);
  const pctFor = (id: string) => {
    const tot = getModuleLessonCount('basic', id);
    if (tot === 0) return null;
    const done = [...completed].filter((l) => l.startsWith(`basic/${id}/`)).length;
    return Math.round((done / tot) * 100);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t('dashboard.missionStatus')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="tele-row">
            <span className="tele-label">{t('dashboard.overallProgress')}</span>
            <span className="tele-value">{overall}%</span>
          </div>
          <div className="tele-bar"><div className="tele-bar-fill" style={{ width: `${overall}%` }} /></div>
        </div>
      </div>

      <div className="module-list">
        <div className="section-label" style={{ marginBottom: 8 }}>{t('dashboard.subjectAreas')}</div>
        {MODULE_IDS.map((id) => {
          const pct = pctFor(id);
          const row = (
            <>
              <div className={`module-icon${pct === null ? ' locked' : ''}`}>
                {pct === null ? '○' : pct === 100 ? '✓' : '◔'}
              </div>
              <div className="module-name">{t(`modules.${id}`)}</div>
              <div className="module-prog">{pct === null ? '—' : `${pct}%`}</div>
            </>
          );
          return pct === null ? (
            <div key={id} className="module-item">{row}</div>
          ) : (
            <Link key={id} href={`/${locale}/learn/basic/${id}`} className="module-item">
              {row}
            </Link>
          );
        })}
      </div>

      <div className="telemetry">
        <div className="section-label" style={{ marginBottom: 4 }}>{t('dashboard.telemetry')}</div>
        <div className="tele-row">
          <span className="tele-label">Mock exams taken</span>
          <span className="tele-value">—</span>
        </div>
        <div className="tele-row">
          <span className="tele-label">Best score</span>
          <span className="tele-value">—</span>
        </div>
      </div>
    </aside>
  );
}
