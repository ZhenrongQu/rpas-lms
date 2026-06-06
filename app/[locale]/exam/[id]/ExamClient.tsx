'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QManifest from '@/components/exam/QManifest';
import Timer from '@/components/exam/Timer';
import QuestionCard from '@/components/exam/QuestionCard';
import type { PublicQuestion } from '@/lib/exam/serialize';
import { EXAM_SPECS } from '@/lib/exam/config';
import type { ExamCertLevel } from '@/lib/content/types';

interface Props {
  sessionId: string;
  locale: string;
  expiresAt: number;
  certLevel: ExamCertLevel;
}

export default function ExamClient({ sessionId, locale, expiresAt, certLevel }: Props) {
  const t = useTranslations('exam');
  const router = useRouter();

  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, string[]>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submittedRef = useRef(false);

  const totalMs = EXAM_SPECS[certLevel].timeLimitMinutes * 60_000;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/exam/${sessionId}/questions`)
      .then(async (r) => {
        if (!r.ok) throw new Error('failed to load questions');
        return (await r.json()) as PublicQuestion[];
      })
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (questions.length === 0) return;
    const q = questions[currentIdx];
    setPendingSelection(confirmed[q.id] ?? []);
  }, [currentIdx, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitExam = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/exam/${sessionId}/submit`, { method: 'POST' });
      if (!res.ok) throw new Error('submit failed');
      router.push(`/${locale}/exam/${sessionId}/results`);
    } catch {
      // Allow a retry instead of leaving the UI stuck on "Submitting…".
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(t('submitFailed'));
    }
  }, [sessionId, locale, router, t]);

  const confirmAnswer = useCallback(async () => {
    const q = questions[currentIdx];
    if (!q || pendingSelection.length === 0) return;

    await fetch(`/api/exam/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, selectedOptionIds: pendingSelection }),
    });

    const newConfirmed = { ...confirmed, [q.id]: pendingSelection };
    setConfirmed(newConfirmed);

    const nextUnanswered = questions.findIndex((qn, i) => i > currentIdx && !newConfirmed[qn.id]);
    if (nextUnanswered !== -1) setCurrentIdx(nextUnanswered);
    else if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
  }, [questions, currentIdx, pendingSelection, confirmed, sessionId]);

  const selectOption = useCallback((optionId: string) => {
    const q = questions[currentIdx];
    if (!q) return;
    if (q.type === 'SINGLE') {
      setPendingSelection([optionId]);
    } else {
      setPendingSelection((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    }
  }, [questions, currentIdx]);

  const toggleFlag = useCallback(() => {
    const q = questions[currentIdx];
    if (!q) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }, [questions, currentIdx]);

  if (loading) {
    return <div className="exam-loading">{t('loading')}</div>;
  }

  if (loadError || questions.length === 0) {
    return (
      <div className="exam-loading" style={{ flexDirection: 'column', gap: 16 }}>
        <div style={{ color: 'var(--red)' }}>{t('loadError')}</div>
        <Link href={`/${locale}/exam`} className="btn-launch">
          ▶ {t('backToLaunch')}
        </Link>
      </div>
    );
  }

  const q = questions[currentIdx];
  if (!q) return null;

  const isConfirmed = Boolean(confirmed[q.id]);
  const isFlagged = flagged.has(q.id);
  const answeredCount = Object.keys(confirmed).length;

  return (
    <div className="exam-view">
      <QManifest
        questions={questions}
        currentIdx={currentIdx}
        confirmed={confirmed}
        flagged={flagged}
        onSelect={setCurrentIdx}
      />

      <div className="exam-main">
        <div className="exam-topbar">
          <div className="q-counter">
            {t('question')} <span>{currentIdx + 1}</span> {t('of')} {questions.length}
          </div>
          <div className="subject-tag">{q.moduleId.replace(/-/g, ' ').toUpperCase()}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {answeredCount}/{questions.length} {t('answered')}
          </div>
        </div>

        <Timer expiresAt={expiresAt} totalMs={totalMs} onExpire={submitExam} />

        <QuestionCard
          question={q}
          pendingSelection={pendingSelection}
          isConfirmed={isConfirmed}
          onSelect={selectOption}
        />

        <div className="action-bar">
          <button
            className="btn-confirm"
            onClick={confirmAnswer}
            disabled={pendingSelection.length === 0 || isConfirmed}
          >
            {t('confirmSelection')}
          </button>

          <button
            className="btn-skip"
            onClick={() => {
              if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
            }}
          >
            {t('skip')} ▶
          </button>

          <button
            className={`btn-flag${isFlagged ? ' flagged' : ''}`}
            onClick={toggleFlag}
          >
            ⚑ {t('flagForReview')}
          </button>

          <button
            className="btn-submit"
            onClick={submitExam}
            disabled={submitting}
          >
            {submitting ? t('submitting') : t('submitExam')}
          </button>
        </div>

        {submitError && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>
            {submitError}
          </div>
        )}

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 'auto' }}>
          Lang: <span style={{ color: 'var(--cyan)' }}>{locale.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
