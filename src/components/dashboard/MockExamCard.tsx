import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { IconAward, IconArrowRight } from '@tabler/icons-react';
import type { ExamHistoryItem } from '@/lib/exam/history';

/** "Mock exam" readiness card: best score, attempt count, recent attempts, and a
 *  start CTA. Exam history is fetched once on the dashboard page (also feeds the
 *  KPI stat) and passed in to avoid a duplicate query. */
export default async function MockExamCard({ items, locale }: { items: ExamHistoryItem[]; locale: string }) {
  const t = await getTranslations({ locale });
  const submitted = items.filter((it) => it.submitted && it.scorePct !== null);
  const best = submitted.reduce<(typeof submitted)[number] | null>(
    (a, b) => (a === null || (b.scorePct ?? 0) > (a.scorePct ?? 0) ? b : a),
    null,
  );
  const bestPct = best ? Math.round((best.scorePct ?? 0) * 100) : null;
  const recent = items.slice(0, 3);

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <span className="dash-card-ico amber"><IconAward size={16} stroke={2} /></span>
        {t('dashboard.mockExam')}
      </div>

      {bestPct === null ? (
        <p className="fr-description">{t('dashboard.noHistory')}</p>
      ) : (
        <>
          <div className="dash-exam-score">
            <b className={best?.passed ? 'pass' : 'fail'}>{bestPct}%</b>
            <span>{t('dashboard.bestOfAttempts', { count: submitted.length })}</span>
          </div>
          <ul className="dash-exam-hist">
            {recent.map((it) => {
              const date = new Date(it.startedAt).toISOString().split('T')[0];
              const pct = it.scorePct === null ? null : Math.round(it.scorePct * 100);
              return (
                <li key={it.id}>
                  <span className="h-date">{date}</span>
                  <span className="h-cert">{t(`certLevel.${it.certLevel}`)}</span>
                  <span className={`h-score${it.passed ? ' pass' : it.submitted ? ' fail' : ''}`}>
                    {pct === null ? '—' : `${pct}%`}
                  </span>
                  {it.submitted && (
                    <Link href={`/${locale}/exam/${it.id}/results`} className="h-link">
                      {t('dashboard.viewResult')}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Link href={`/${locale}/exam`} className="btn-launch dash-exam-cta">
        {t('dashboard.startExam')} <IconArrowRight size={16} stroke={2} />
      </Link>
    </section>
  );
}
