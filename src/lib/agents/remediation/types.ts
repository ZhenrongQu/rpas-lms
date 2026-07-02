export const ACTIVE_PHASES = [
  "RECEIVED",
  "TRIAGING",
  "CLASSIFIED",
  "REPRODUCING",
  "FIXING",
  "VERIFYING",
  "PROPOSING",
] as const;

export const TERMINAL_PHASES = [
  "PROPOSED",
  "ALREADY_FIXED",
  "NOT_REPRODUCIBLE",
  "NEEDS_HUMAN",
  "FAILED",
  "CANCELLED",
] as const;

export const REMEDIATION_PHASES = [...ACTIVE_PHASES, ...TERMINAL_PHASES] as const;
export type RemediationPhase = (typeof REMEDIATION_PHASES)[number];
