import type { RemediationPhase } from "./types";

const EDGES: Readonly<Record<RemediationPhase, readonly RemediationPhase[]>> = {
  RECEIVED: ["TRIAGING", "FAILED", "CANCELLED"],
  TRIAGING: ["CLASSIFIED", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  CLASSIFIED: ["REPRODUCING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  REPRODUCING: ["FIXING", "ALREADY_FIXED", "NOT_REPRODUCIBLE", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  FIXING: ["VERIFYING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  // VERIFYING → PROPOSING is the sandbox-fixture self-test path; production-black-box
  // runs must go through ATTESTING (an external black-box verdict) first.
  VERIFYING: ["ATTESTING", "PROPOSING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  ATTESTING: ["PROPOSING", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  PROPOSING: ["PROPOSED", "NEEDS_HUMAN", "FAILED", "CANCELLED"],
  PROPOSED: [],
  ALREADY_FIXED: [],
  NOT_REPRODUCIBLE: [],
  NEEDS_HUMAN: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RemediationPhase, to: RemediationPhase): boolean {
  return EDGES[from].includes(to);
}

export function assertTransition(from: RemediationPhase, to: RemediationPhase): void {
  if (!canTransition(from, to)) throw new Error(`invalid remediation transition ${from} → ${to}`);
}
