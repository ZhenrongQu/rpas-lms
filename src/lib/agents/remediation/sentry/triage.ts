import { normalize } from "node:path";
import type { SentryIssue } from "./sentryIssue";
import type { SentryRepo } from "./sentryRepo";

export type TriageResult =
  | { kind: "reproducible"; sourceRelPath: string; fnName: string; knownGoodCommit: string; defectiveCommit: string }
  | { kind: "escalate"; reason: string };

/** Thrown-exception classes we can reproduce as a bare call. NOT network/timeout/DB. */
export const SYNTHESIZABLE_ERRORS = ["TypeError", "RangeError", "ReferenceError", "Error"];

/** Normalize a frame filename to a repo-relative path inside src/ with no traversal/escape,
 *  or null if it is not a safe in-src path. */
function safeSourceRelPath(filename: string): string | null {
  const rel = normalize(filename).replace(/^\.\//, "");
  if (rel.startsWith("..") || rel.includes("/../") || rel.startsWith("/")) return null;
  if (!rel.startsWith("src/")) return null;
  return rel;
}

/**
 * Decide whether a Sentry issue is auto-fixable (regression-shaped + reproducible as a
 * bare call), or escalate with a reason. Every gate is fail-closed; see spec §3.3.
 */
export async function classifySentryIssue(issue: SentryIssue, repo: SentryRepo): Promise<TriageResult> {
  const { current, previous } = issue.release;
  if (!previous) return { kind: "escalate", reason: "no-previous-release" };
  if (!(await repo.commitExists(current)) || !(await repo.commitExists(previous)) || !(await repo.isAncestor(previous, current))) {
    return { kind: "escalate", reason: "unresolvable-or-nonlinear-release" };
  }
  const frame = issue.frames.find((f) => f.inApp);
  if (!frame) return { kind: "escalate", reason: "not-in-app" };
  if (!SYNTHESIZABLE_ERRORS.includes(issue.error.type)) return { kind: "escalate", reason: "unsynthesizable-error-class" };

  const sourceRelPath = safeSourceRelPath(frame.filename);
  if (!sourceRelPath || !(await repo.fileExistsAt(current, sourceRelPath))) {
    return { kind: "escalate", reason: "source-not-in-repo" };
  }
  const changed = await repo.changedSourceFiles(previous, current);
  if (changed.length !== 1 || changed[0] !== sourceRelPath) {
    return { kind: "escalate", reason: "unsupported-multi-file-regression" };
  }
  if (!(await repo.hasNamedExport(current, sourceRelPath, frame.function))) {
    return { kind: "escalate", reason: "frame-not-named-export" };
  }
  return { kind: "reproducible", sourceRelPath, fnName: frame.function, knownGoodCommit: previous, defectiveCommit: current };
}
