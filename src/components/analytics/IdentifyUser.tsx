'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { identifyUser } from '@/lib/analytics/client';

/**
 * Ties this browser's anonymous history to the signed-in account (PRD U7).
 *
 * Runs wherever a signed-in user lands rather than only on the sign-in handler,
 * so the link is repaired for anyone who was already signed in when analytics
 * shipped. `$identify` is idempotent, so repeating it is free.
 *
 * Sentry gets the SAME id — U7's third rule. Only the id, never the email:
 * `sendDefaultPii: false` stays true, and the id alone is what makes "which
 * paying customers hit this error" answerable by joining the two systems.
 */
export default function IdentifyUser({ userId }: { userId: string }) {
  useEffect(() => {
    identifyUser(userId);
    Sentry.setUser({ id: userId });
  }, [userId]);

  return null;
}
