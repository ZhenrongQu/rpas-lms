import { getTranslations } from 'next-intl/server';
import { MODULE_IDS } from '@/lib/content/types';

export default async function ExamSidebar() {
  const t = await getTranslations();

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t('dashboard.missionStatus')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="tele-row">
            <span className="tele-label">{t('dashboard.overallProgress')}</span>
            <span className="tele-value">0%</span>
          </div>
          <div className="tele-bar"><div className="tele-bar-fill" style={{ width: '0%' }} /></div>
        </div>
      </div>

      <div className="module-list">
        <div className="section-label" style={{ marginBottom: 8 }}>{t('dashboard.subjectAreas')}</div>
        {MODULE_IDS.map((id) => (
          <div key={id} className="module-item">
            <div className="module-icon locked">○</div>
            <div className="module-name">{t(`modules.${id}`)}</div>
            <div className="module-prog">0%</div>
          </div>
        ))}
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
