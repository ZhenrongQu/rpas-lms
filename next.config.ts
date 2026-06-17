import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet locally, verbose in CI/Vercel build logs.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for better stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry's internal logger from the bundle (replaces deprecated disableLogger).
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
  // tunnelRoute intentionally NOT set: a tunnel path (e.g. /monitoring) would be
  // caught by the next-intl middleware matcher and redirected to /en/monitoring,
  // breaking it. See spec "已知交互".
});
