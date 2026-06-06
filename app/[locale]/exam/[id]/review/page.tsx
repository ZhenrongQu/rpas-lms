import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { examService } from '@/lib/exam/instance';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ReviewPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale });

  const review = await examService.getReview(id);
  if (!review) notFound();

  const labelFor = (item: (typeof review)[number], ids: string[]) =>
    ids.length === 0
      ? t('review.notAnswered')
      : item.options
          .filter((o) => ids.includes(o.id))
          .map((o) => o.label)
          .join(', ');

  return (
    <div className="review-view">
      <div className="review-head">
        <div className="review-title">// {t('review.title')}</div>
        <Link href={`/${locale}/exam/${id}/results`} className="btn-review">
          ↩ {t('review.backToResults')}
        </Link>
      </div>

      <div className="review-list">
        {review.map((item, i) => (
          <div key={item.id} className={`hud-panel review-card${item.isCorrect ? ' ok' : ' bad'}`}>
            <div className="review-card-head">
              <span className="review-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="review-module">{t(`modules.${item.moduleId}`)}</span>
              <span className={`review-flag${item.isCorrect ? ' ok' : ' bad'}`}>
                {item.isCorrect ? t('review.correct') : t('review.incorrect')}
              </span>
            </div>
            <div className="review-stem">{item.stem}</div>
            <ul className="review-options">
              {item.options.map((o) => {
                const chosen = item.selectedOptionIds.includes(o.id);
                const cls = o.isCorrect ? 'opt correct' : chosen ? 'opt chosen-wrong' : 'opt';
                return (
                  <li key={o.id} className={cls}>
                    <span className="opt-mark">{o.isCorrect ? '✓' : chosen ? '✕' : '·'}</span>
                    {o.label}
                  </li>
                );
              })}
            </ul>
            <div className="review-meta">
              <span className="review-meta-label">{t('review.yourAnswer')}:</span>{' '}
              <span className={item.isCorrect ? 'ok' : 'bad'}>
                {labelFor(item, item.selectedOptionIds)}
              </span>
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
        ))}
      </div>
    </div>
  );
}
