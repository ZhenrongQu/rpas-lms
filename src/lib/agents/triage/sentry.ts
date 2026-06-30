import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pluggable Sentry source. FixtureSentrySource (sandbox) reads sample issues from
 * a JSON file; SentryApiSource is the same-interface stub for the real API. The
 * existing SENTRY_AUTH_TOKEN is source-map-upload only — the real path needs a
 * token with event:read/project:read scope, so the sandbox defaults to fixtures.
 */

export type SentryIssue = {
  id: string;
  title: string;
  level: string;
  culprit: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  metadata: { type: string; value: string };
  stacktrace: string;
};

export interface SentrySource {
  unresolvedIssues(): Promise<SentryIssue[]>;
}

export class FixtureSentrySource implements SentrySource {
  async unresolvedIssues(): Promise<SentryIssue[]> {
    const p = join(process.cwd(), "scripts/agents/fixtures/sentry-issues.json");
    return JSON.parse(readFileSync(p, "utf8")) as SentryIssue[];
  }
}

export class SentryApiSource implements SentrySource {
  unresolvedIssues(): Promise<SentryIssue[]> {
    throw new Error(
      "SentryApiSource not implemented — needs SENTRY_AUTH_TOKEN with event:read scope. Use fixtures in sandbox.",
    );
  }
}

/** Sandbox default. Swap to SentryApiSource once an API-scoped token is configured. */
export function getSentrySource(): SentrySource {
  return new FixtureSentrySource();
}
