import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { examService } from '@/lib/exam/instance';
import ProgressRing from '@/components/dashboard/ProgressRing';
import SubjectBreakdown from '@/components/results/SubjectBreakdown';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ResultsPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale });

  const result = await examService.getResult(id);
  if (!result) {
    return (
      <div className="results-view" style={{ justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontSize: 13 }}>
          {t('results.notFound')}
        </div>
        <Link href={`/${locale}/exam`} className="btn-launch">
          ▶ {t('examLaunch.launch')}
        </Link>
      </div>
    );
  }

  const scorePct = Math.round(result.scorePct * 100);
  const passed = result.passed;
  const now = new Date().toISOString().split('T')[0];

  return (
    <div className="results-view">
      <div className="result-header">
        <div className={`result-status${passed ? ' pass' : ' fail'}`}>
          {passed ? t('results.missionComplete') : t('results.missionFailed')}
        </div>
        <div className="result-code">
          // {passed ? t('results.passStatus') : t('results.failStatus')} · {result.correct}/{result.total} · {now}
        </div>
      </div>

      <div className="result-score-row">
        <div className="hud-panel score-gauge-card">
          <ProgressRing
            pct={scorePct}
            size={130}
            label={`${scorePct}%`}
            sublabel={t('results.score')}
          />
          <div className="score-detail">
            <strong className={passed ? '' : 'fail'}>{result.correct}</strong> / {result.total} {t('results.correct')}
            <br />
            <span style={{ color: passed ? 'var(--green)' : 'var(--red)', fontSize: 11 }}>
              {passed ? '↑' : '↓'} {passed ? t('results.passStatus') : t('results.failStatus')}
            </span>
          </div>
          <div className="overall-label">
            // RESULT: {passed ? t('results.passStatus') : t('results.failStatus')}
          </div>
        </div>

        <SubjectBreakdown bySubject={result.bySubject} locale={locale} />
      </div>

      <div className="result-actions">
        <Link href={`/${locale}/exam`} className="btn-retry">
          ▶ {t('results.newMission')}
        </Link>
        <Link href={`/${locale}`} className="btn-review">
          ↩ {t('results.reviewAnswers')}
        </Link>
      </div>
    </div>
  );
}
