'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLessonProgress } from '@/components/learn/lessonProgressContext';

interface PublicQ {
  id: string;
  type: 'SINGLE' | 'MULTI';
  selectCount: number;
  stem: string;
  options: { id: string; label: string }[];
}

export default function Checkpoint({ questionId, locale }: { questionId: string; locale: string }) {
  const t = useTranslations('checkpoint');
  const { register, pass } = useLessonProgress();
  const [q, setQ] = useState<PublicQ | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean; explanation: string } | null>(null);

  useEffect(() => {
    register(questionId);
    let cancelled = false;
    fetch(`/api/checkpoint/${questionId}?locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setQ(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [questionId, locale, register]);

  if (!q) return <div className="checkpoint loading">{t('loading')}</div>;

  const toggle = (id: string) => {
    if (result?.correct) return;
    if (q.type === 'SINGLE') setSel([id]);
    else setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  async function check() {
    const res = await fetch('/api/checkpoint/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, selectedOptionIds: sel, locale }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setResult({ correct: data.correct, explanation: data.explanation });
    if (data.correct) pass(questionId);
  }

  return (
    <div className={`checkpoint${result ? (result.correct ? ' ok' : ' bad') : ''}`}>
      <div className="checkpoint-tag">{t('title')}</div>
      <div className="checkpoint-stem">{q.stem}</div>
      {q.type === 'MULTI' && (
        <div className="checkpoint-hint">{t('selectN', { count: q.selectCount })}</div>
      )}
      <ul className="checkpoint-options">
        {q.options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={`cp-opt${sel.includes(o.id) ? ' selected' : ''}`}
              onClick={() => toggle(o.id)}
              disabled={result?.correct}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      {!result?.correct && (
        <button
          type="button"
          className="btn-launch cp-check"
          onClick={check}
          disabled={sel.length === 0}
        >
          {t('check')}
        </button>
      )}
      {result && (
        <div className={`checkpoint-feedback ${result.correct ? 'ok' : 'bad'}`}>
          <strong>{result.correct ? t('correct') : t('incorrect')}</strong>
          {result.correct && <p>{result.explanation}</p>}
          {!result.correct && <p>{t('tryAgain')}</p>}
        </div>
      )}
    </div>
  );
}
