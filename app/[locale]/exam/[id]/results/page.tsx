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
  const review = await examService.getReview(id);
  const incorrect = (review ?? []).filter((item) => !item.isCorrect);
  const labelFor = (item: (typeof incorrect)[number], ids: string[]) =>
    ids.length === 0
      ? t('review.notAnswered')
      : item.options
          .filter((o) => ids.includes(o.id))
          .map((o) => o.label)
          .join(', ');

  return (
    <div className="results-view">
      <div className="result-header">
        <div className={`result-status${passed ? ' pass' : ' fail'}`}>
          {passed ? t('results.missionComplete') : t('results.missionFailed')}
        </div>
        <div className="result-code">
          {passed ? t('results.passStatus') : t('results.failStatus')} · {result.correct}/{result.total} · {now}
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
            {t('results.resultLabel')}: {passed ? t('results.passStatus') : t('results.failStatus')}
          </div>
        </div>

        <SubjectBreakdown bySubject={result.bySubject} locale={locale} />
      </div>

      <div className="result-actions">
        <Link href={`/${locale}/exam`} className="btn-retry">
          ▶ {t('results.newMission')}
        </Link>
        <Link href={`/${locale}/exam/${id}/review`} className="btn-review">
          ↩ {t('results.reviewAnswers')}
        </Link>
      </div>

      <div className="review-list" style={{ width: '100%' }}>
        <div className="review-title">{t('results.incorrectReview')}</div>
        {incorrect.length === 0 ? (
          <div className="hud-panel review-card ok">{t('results.noIncorrect')}</div>
        ) : (
          incorrect.map((item, i) => (
            <div key={item.id} className="hud-panel review-card bad">
              <div className="review-card-head">
                <span className="review-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="review-module">{t(`modules.${item.moduleId}`)}</span>
                <span className="review-flag bad">{t('review.incorrect')}</span>
              </div>
              <div className="review-stem">{item.stem}</div>
              <div className="review-meta">
                <span className="review-meta-label">{t('review.yourAnswer')}:</span>{' '}
                <span className="bad">{labelFor(item, item.selectedOptionIds)}</span>
              </div>
              <div className="review-meta">
                <span className="review-meta-label">{t('review.correctAnswer')}:</span>{' '}
                <span className="ok">{labelFor(item, item.correctOptionIds)}</span>
              </div>
              <div className="review-explanation">
                <span className="review-meta-label">{t('review.explanation')}:</span> {item.explanation}
              </div>
              <div className="review-reference">
                <span className="review-meta-label">{t('review.reference')}:</span> {item.reference}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
