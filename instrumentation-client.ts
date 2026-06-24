import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // No Session Replay (privacy + quota): replay integration intentionally omitted.
  ignoreErrors: [
    // Noise from visitors' anti-fingerprint / antidetect browser extensions
    // (injected RPC bridge). Not our code; surfaces as an unhandled rejection
    // captured by Sentry's global handler. See breadcrumb "antifingerprint not defined yet".
    'Object Not Found Matching Id',
  ],
});

// Lets Sentry trace App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
