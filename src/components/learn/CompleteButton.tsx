'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLessonProgress } from '@/components/learn/lessonProgressContext';

interface Props {
  lessonId: string;
  nextHref: string | null;
  backHref: string;
}

export default function CompleteButton({ lessonId, nextHref, backHref }: Props) {
  const t = useTranslations('learn');
  const router = useRouter();
  const { allPassed } = useLessonProgress();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    await fetch('/api/progress/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
    }).catch(() => {});
    setBusy(false);
    router.push(nextHref ?? backHref);
    router.refresh();
  }

  return (
    <div className="lesson-actions">
      <Link href={backHref} className="btn-review">↩ {t('backToModule')}</Link>
      <button type="button" className="btn-launch" onClick={complete} disabled={!allPassed || busy}>
        {allPassed ? (nextHref ? `${t('completeNext')} ▶` : `${t('complete')} ✓`) : t('answerToContinue')}
      </button>
    </div>
  );
}
