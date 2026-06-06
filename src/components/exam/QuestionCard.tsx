'use client';

import type { PublicQuestion } from '@/lib/exam/serialize';

interface Props {
  question: PublicQuestion;
  pendingSelection: string[];
  isConfirmed: boolean;
  onSelect: (optionId: string) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuestionCard({ question, pendingSelection, isConfirmed, onSelect }: Props) {
  return (
    <div className="hud-panel question-card">
      <div className="hud-panel-glow" />
      <div className="q-stem">{question.stem}</div>
      {question.type === 'MULTI' && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', marginTop: 8 }}>
          Select {question.selectCount}
        </div>
      )}
      <div className="options">
        {question.options.map((opt, i) => {
          const sel = pendingSelection.includes(opt.id);
          return (
            <div
              key={opt.id}
              className={`option${sel ? ' selected' : ''}${isConfirmed ? ' answered' : ''}`}
              onClick={() => !isConfirmed && onSelect(opt.id)}
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
