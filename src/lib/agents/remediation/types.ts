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

/**
 * Which proof a run's PROPOSED must rest on. Frozen into the target at reproduction
 * (NOT inferred from repairer trust). `sandbox-fixture` lets the deterministic oracle
 * self-test the mechanism; `production-black-box` demands an external attestation the
 * code under test cannot forge — until a real attestor exists, it must fail closed to
 * NEEDS_HUMAN.
 */
export const VERIFICATION_PROFILES = ["sandbox-fixture", "production-black-box"] as const;
export type VerificationProfile = (typeof VERIFICATION_PROFILES)[number];

/**
 * Parse a run's frozen target JSON to its verification profile, or `null` when the
 * target is missing / legacy (no profile) / malformed / an unknown value. Callers MUST
 * fail closed on `null` (escalate; never default to `sandbox-fixture`), so heuristic
 * evidence can never silently gain publish rights. Shared by the driver gate and the
 * publish boundary so both use one allowlist, not divergent ad-hoc checks.
 */
export function verificationProfileFromTarget(target: unknown): VerificationProfile | null {
  if (!target || typeof target !== "object") return null;
  const p = (target as Record<string, unknown>).verificationProfile;
  return p === "sandbox-fixture" || p === "production-black-box" ? p : null;
}
