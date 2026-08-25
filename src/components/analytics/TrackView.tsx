'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/client';
import type { AnalyticsEvent } from '@/lib/analytics/events';

/**
 * Records one funnel event when a page is viewed (PRD U7). Dropped into server
 * components, which cannot fire client-side analytics themselves.
 *
 * Guarded against React's development double-effect and Fast Refresh, which would
 * otherwise double-count every entry step of the funnel.
 */
export default function TrackView({
  event,
  userId = null,
}: {
  event: AnalyticsEvent;
  userId?: string | null;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, {}, userId);
  }, [event, userId]);

  return null;
}
