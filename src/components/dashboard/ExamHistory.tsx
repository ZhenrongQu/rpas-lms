import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listUserExamHistory } from '@/lib/exam/history';

export default async function ExamHistory({ userId, locale }: { userId: string; locale: string }) {
  const t = await getTranslations({ locale });
  const items = await listUserExamHistory(userId);

  return (
    <div className="hud-panel history-card">
      <div className="breakdown-title">{t('dashboard.history')}</div>
      {items.length === 0 ? (
        <div className="history-empty">{t('dashboard.noHistory')}</div>
      ) : (
        <ul className="history-list">
          {items.map((it) => {
            const date = new Date(it.startedAt).toISOString().split('T')[0];
            const pct = it.scorePct === null ? null : Math.round(it.scorePct * 100);
            return (
              <li key={it.id} className="history-row">
                <span className="history-date">{date}</span>
                <span className="history-cert">{t(`certLevel.${it.certLevel}`)}</span>
                <span className={`history-score${it.passed ? ' pass' : it.submitted ? ' fail' : ''}`}>
                  {pct === null ? '—' : `${pct}%`}
                </span>
                {it.submitted && (
                  <Link href={`/${locale}/exam/${it.id}/results`} className="history-link">
                    {t('dashboard.viewResult')}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
