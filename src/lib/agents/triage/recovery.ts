/**
 * Idempotency / recovery policy for the triage poller. Deciding whether to (re)run
 * triage for an issue is a pure function of the existing AgentRun's state, so it is
 * unit-testable without a DB or a clock:
 *
 *   - no prior run            → triage it (first time)
 *   - prior run "done"        → skip (terminal success — a ticket was filed/deduped)
 *   - prior run "failed"      → retry (a previous attempt errored out)
 *   - prior run "running"     → reclaim ONLY if stale; a fresh one may still be
 *                               owned by a live process, but a crashed process would
 *                               otherwise leave the issue skipped forever.
 */

export const STALE_MS = 10 * 60_000; // a "running" row older than this is treated as crashed

export type TriageRunState = { status: string; updatedAt: Date } | null;

export function shouldTriage(
  seen: TriageRunState,
  now: number = Date.now(),
  staleMs: number = STALE_MS,
): boolean {
  if (!seen) return true;
  if (seen.status === "done") return false;
  if (seen.status === "running") return now - seen.updatedAt.getTime() >= staleMs;
  return true; // failed, or any other non-terminal state → retry
}
