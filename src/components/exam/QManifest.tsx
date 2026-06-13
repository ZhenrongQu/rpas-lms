'use client';

import { useTranslations } from 'next-intl';
import type { PublicQuestion } from '@/lib/exam/serialize';

interface Props {
  questions: PublicQuestion[];
  currentIdx: number;
  confirmed: Record<string, string[]>;
  flagged: Set<string>;
  onSelect: (idx: number) => void;
}

export default function QManifest({ questions, currentIdx, confirmed, flagged, onSelect }: Props) {
  const t = useTranslations('exam');

  return (
    <div className="q-manifest">
      <div className="section-label" style={{ fontSize: 8, marginBottom: 6 }}>Q-MAP</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 8 }}>
        {Object.keys(confirmed).length}/{questions.length} {t('answered')}
      </div>
      <div className="q-grid">
        {questions.map((q, i) => {
          const isAnswered = Boolean(confirmed[q.id]);
          const isFlagged = flagged.has(q.id);
          const isCurrent = i === currentIdx;
          let cls = 'q-dot';
          if (isCurrent) cls += ' current';
          else if (isFlagged) cls += ' flagged';
          else if (isAnswered) cls += ' answered';
          return (
            <div key={q.id} className={cls} onClick={() => onSelect(i)} title={q.moduleId}>
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}
