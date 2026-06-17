import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown in Server Components, route handlers, etc.
// This is the hook that would have caught the 2026-06-16 dashboard 500.
export const onRequestError = Sentry.captureRequestError;
