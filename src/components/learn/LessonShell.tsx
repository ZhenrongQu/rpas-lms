'use client';

import type { ReactNode } from 'react';
import { LessonProgressProvider } from '@/components/learn/lessonProgressContext';
import CompleteButton from '@/components/learn/CompleteButton';
import AutoComplete from '@/components/learn/AutoComplete';

interface Props {
  children: ReactNode;
  lessonId: string;
  nextHref: string | null;
  backHref: string;
  /** U11: only signed-in readers have progress to record. */
  autoComplete: boolean;
}

export default function LessonShell({
  children,
  lessonId,
  nextHref,
  backHref,
  autoComplete,
}: Props) {
  return (
    <LessonProgressProvider>
      {children}
      {/* After the children — reaching this means the body AND its checkpoints
          have scrolled past, not just the prose. */}
      <AutoComplete lessonId={lessonId} enabled={autoComplete} />
      <CompleteButton lessonId={lessonId} nextHref={nextHref} backHref={backHref} />
    </LessonProgressProvider>
  );
}
