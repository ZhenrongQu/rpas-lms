import * as Sentry from '@sentry/nextjs';

// Runs in the Edge runtime (e.g. middleware).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
