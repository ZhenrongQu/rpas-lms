import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    await reportSchemaDrift();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Reports a database that is missing what `prisma db push` cannot create —
 * the partial unique indexes, or the Flight Review credit migration.
 *
 * Deliberately does NOT throw. Throwing here would 500 every request on the
 * instance, and a missing index is a downgraded concurrency guarantee, not data
 * actively corrupting — taking the whole site down in response would be a worse
 * outage than the problem. "Loud" is Sentry at fatal plus the 503 from
 * /api/health/schema, which a deploy smoke test can actually check.
 *
 * Its own failure is swallowed: a boot-time diagnostic must never be the reason
 * the app cannot boot.
 */
async function reportSchemaDrift() {
  try {
    const { verifySchemaInvariants, describeSchemaDrift } = await import(
      './src/lib/ops/schemaGuards'
    );
    const report = await verifySchemaInvariants();
    if (report.ok) return;

    const message = `Database schema drift: ${describeSchemaDrift(report)}`;
    console.error(message);
    Sentry.captureMessage(message, 'fatal');
  } catch (error) {
    console.error('Could not verify schema invariants', error);
  }
}

// Captures errors thrown in Server Components, route handlers, etc.
// This is the hook that would have caught the 2026-06-16 dashboard 500.
export const onRequestError = Sentry.captureRequestError;
