import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only send in deployed (production-build) environments. Local `next dev`
  // (NODE_ENV=development) stays silent; a missing DSN also no-ops.
  enabled: process.env.NODE_ENV === 'production',
  // Low perf sampling to stay inside the free quota; errors are always 100%.
  tracesSampleRate: 0.1,
  // Privacy: do not attach IP / cookies / request bodies by default.
  sendDefaultPii: false,
});
