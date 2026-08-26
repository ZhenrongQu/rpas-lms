import type { AnalyticsEvent, AnalyticsProperties } from "./events";

/**
 * Minimal PostHog capture over its HTTP ingest API (PRD U7).
 *
 * Everything here is a no-op without NEXT_PUBLIC_POSTHOG_KEY, matching how
 * Sentry and the AI assistant already behave: a missing integration key must
 * never break the product, only silence the integration.
 *
 * Deliberately not posthog-js. The two funnels U7 asks for are explicit events,
 * which the ingest API serves directly; the SDK's autocapture and session replay
 * would add a client bundle and a privacy surface neither funnel needs. Adopting
 * the SDK later is a drop-in change behind these two functions.
 */
/** Read per call, not captured at module load: a self-hosted deployment sets its
 *  own host, and reading it here keeps the module honest under test. */
function host(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
}

function apiKey(): string | null {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY || null;
}

export function analyticsEnabled(): boolean {
  return apiKey() !== null;
}

type CaptureProperties = AnalyticsProperties | {
  $anon_distinct_id: string;
  $set: AnalyticsProperties;
};

type CapturePayload = {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: CaptureProperties;
  timestamp: string;
};

/** Fire-and-forget POST. Analytics must never delay or fail the thing it measures. */
async function send(payload: CapturePayload): Promise<void> {
  try {
    await fetch(`${host()}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // survives a navigation away from the page
    });
  } catch {
    /* a dropped analytics event is not worth a user-visible failure */
  }
}

/**
 * Records one event against a distinct id.
 *
 * `distinctId` must be the Customer id for signed-in users — the same value
 * Sentry uses — so "which paying customers hit this error" is answerable by
 * joining the two. For anonymous visitors it is the browser-local id from
 * `anonymousId()`, which `identify()` later stitches to the account.
 */
export async function capture(
  event: AnalyticsEvent,
  distinctId: string,
  properties: AnalyticsProperties = {},
): Promise<void> {
  const key = apiKey();
  if (!key) return;
  await send({
    api_key: key,
    event,
    distinct_id: distinctId,
    properties,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Attaches everything the visitor did anonymously to their new account.
 *
 * The same stitching idea as the guest exam-session claim (PRD U6), and it has to
 * happen at the same moment: without it, the conversion funnel breaks in half at
 * exactly the step it exists to measure.
 */
export async function identify(
  userId: string,
  anonymousDistinctId: string,
  properties: AnalyticsProperties = {},
): Promise<void> {
  const key = apiKey();
  if (!key) return;
  await send({
    api_key: key,
    event: "$identify",
    distinct_id: userId,
    properties: { $anon_distinct_id: anonymousDistinctId, $set: properties },
    timestamp: new Date().toISOString(),
  });
}
