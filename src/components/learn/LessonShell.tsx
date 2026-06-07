'use client';

import type { ReactNode } from 'react';
import { LessonProgressProvider } from '@/components/learn/lessonProgressContext';
import CompleteButton from '@/components/learn/CompleteButton';

interface Props {
  children: ReactNode;
  lessonId: string;
  nextHref: string | null;
  backHref: string;
}

export default function LessonShell({ children, lessonId, nextHref, backHref }: Props) {
  return (
    <LessonProgressProvider>
      {children}
      <CompleteButton lessonId={lessonId} nextHref={nextHref} backHref={backHref} />
    </LessonProgressProvider>
  );
}
