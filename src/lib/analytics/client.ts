"use client";

import { capture, identify } from "./posthog";
import type { AnalyticsEvent, AnalyticsProperties } from "./events";

/**
 * Browser-side analytics identity (PRD U7).
 *
 * A visitor has an id before they have an account, or the conversion funnel
 * cannot start at the landing page. It lives in localStorage and is replaced by
 * the Customer id once they sign in, so the two halves of the funnel join up.
 */
const ANON_KEY = "rpas.analyticsId";

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `anon-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function anonymousId(): string {
  try {
    const existing = window.localStorage.getItem(ANON_KEY);
    if (existing) return existing;
    const created = randomId();
    window.localStorage.setItem(ANON_KEY, created);
    return created;
  } catch {
    // Private mode / storage blocked: still emit events, just unlinkable.
    return randomId();
  }
}

/** Records an event for the current visitor, signed in or not. */
export function track(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
  userId?: string | null,
): void {
  void capture(event, userId || anonymousId(), properties);
}

/** Links this browser's anonymous history to the account that just signed up. */
export function identifyUser(userId: string, properties: AnalyticsProperties = {}): void {
  void identify(userId, anonymousId(), properties);
  try {
    window.localStorage.setItem(ANON_KEY, userId);
  } catch {
    /* nothing to persist if storage is unavailable */
  }
}
