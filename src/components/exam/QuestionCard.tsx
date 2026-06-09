'use client';

import { useTranslations } from 'next-intl';
import type { PublicQuestion } from '@/lib/exam/serialize';

interface Props {
  question: PublicQuestion;
  pendingSelection: string[];
  isConfirmed: boolean;
  onSelect: (optionId: string) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuestionCard({ question, pendingSelection, isConfirmed, onSelect }: Props) {
  const t = useTranslations('exam');
  return (
    <div className="hud-panel question-card">
      <div className="hud-panel-glow" />
      <div className="q-stem">{question.stem}</div>
      {question.media && (
        <div className="q-media">
          {question.media.kind === 'video' ? (
            <video src={question.media.url} controls aria-label={question.media.alt} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.media.url} alt={question.media.alt} loading="lazy" />
          )}
        </div>
      )}
      {question.type === 'MULTI' && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', marginTop: 8 }}>
          {t('selectN', { count: question.selectCount })}
        </div>
      )}
      <div className="options">
        {question.options.map((opt, i) => {
          const sel = pendingSelection.includes(opt.id);
          return (
            <div
              key={opt.id}
              className={`option${sel ? ' selected' : ''}${isConfirmed ? ' answered' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              <div className="option-letter">{LETTERS[i] ?? opt.id.toUpperCase()}</div>
              <div className="option-text">{opt.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
