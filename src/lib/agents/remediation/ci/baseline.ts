export type CiEvent =
  | { kind: "pull_request"; headSha: string; baseRef: string }
  | { kind: "push"; branch: string; headSha: string };

/** Git operations the resolver needs — injected so unit tests never shell out. */
export interface GitOps {
  mergeBase(a: string, b: string): Promise<string>;
}

/** The CI history the resolver queries for the last green commit on a branch. */
export interface CiHistory {
  lastGreenCommit(branch: string, beforeSha: string): Promise<string | null>;
}

export type Baseline = { knownGoodCommit: string; defectiveCommit: string };

/**
 * Resolve the known-good baseline + the defective commit for a CI failure:
 *   • pull_request → defective = head, known-good = merge-base(base, head).
 *   • push:main    → defective = head, known-good = the last commit whose CI was green.
 * Returns null when no baseline exists (e.g. no prior green run on main) — a safe no-op.
 */
export async function resolveBaseline(event: CiEvent, git: GitOps, history: CiHistory): Promise<Baseline | null> {
  if (event.kind === "pull_request") {
    const knownGoodCommit = await git.mergeBase(event.baseRef, event.headSha);
    return { knownGoodCommit, defectiveCommit: event.headSha };
  }
  const knownGoodCommit = await history.lastGreenCommit(event.branch, event.headSha);
  return knownGoodCommit ? { knownGoodCommit, defectiveCommit: event.headSha } : null;
}
