'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics/client';

/**
 * Marks the lesson complete once the reader reaches the end of its content
 * (PRD U11).
 *
 * "Read it" is judged by scrolling to the bottom — the decision's criterion, and
 * the only one that is simple and predictable. Dwell timers punish careful
 * readers and reward idle tabs equally badly.
 *
 * The sentinel renders after the lesson body AND its checkpoints, so reaching it
 * means the whole lesson scrolled past, not just the prose.
 */
export default function AutoComplete({
  lessonId,
  enabled,
}: {
  lessonId: string;
  enabled: boolean;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  // Guards against the observer firing repeatedly while the reader scrolls
  // around the end of the page. The server upsert is idempotent either way;
  // this just keeps it to one request.
  const sent = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !sentinel.current) return;
    const node = sentinel.current;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || sent.current) return;
      sent.current = true;
      observer.disconnect();
      fetch('/api/progress/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      })
        // Refresh so the sidebar tick and dashboard progress reflect it without
        // making the reader navigate away and back.
        .then(() => {
          track('lesson_completed', { lessonId, trigger: 'scroll' });
          router.refresh();
        })
        .catch(() => { sent.current = false; });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, lessonId, router]);

  return <div ref={sentinel} aria-hidden className="lesson-end-sentinel" />;
}
