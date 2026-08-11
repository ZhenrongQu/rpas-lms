import { readFile } from "node:fs/promises";

export type SentryFrame = { function: string; filename: string; lineno: number; inApp: boolean };

export type SentryIssue = {
  id: string;
  title: string;
  culprit: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  error: { type: string; value: string };
  frames: SentryFrame[];
  /** Commit SHAs (slice 1): current = defective, previous = known-good candidate. */
  release: { current: string; previous: string | null };
};

/** A pluggable feed of unresolved Sentry issues. */
export interface SentrySource {
  unresolvedIssues(): Promise<SentryIssue[]>;
}

/** Slice-1 default: read synthesized issues from a JSON fixture file. */
export class FixtureSentrySource implements SentrySource {
  constructor(private readonly path: string) {}
  async unresolvedIssues(): Promise<SentryIssue[]> {
    return JSON.parse(await readFile(this.path, "utf8")) as SentryIssue[];
  }
}

// The real API-backed source lives in ./sentryApi.ts (SentryApiSource) — kept separate so
// this module stays free of transport concerns.
