export const ACTIVE_PHASES = [
  "RECEIVED",
  "TRIAGING",
  "CLASSIFIED",
  "REPRODUCING",
  "FIXING",
  "VERIFYING",
  "ATTESTING",
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

/**
 * A request the kernel sends to an external black-box verifier. Every field binds the
 * attestation to exactly this run / patch / verifier bundle / VM image, so a signed
 * verdict can never be replayed for a different run, patch, test bundle, or image. The
 * `nonce` is generated ONCE when the run enters ATTESTING and frozen on the run, so a
 * resume re-requests the identical request and a stale attestation cannot be reused.
 */
export type BlackBoxRequest = {
  version: 1;
  runId: string;
  nonce: string;
  incidentFingerprint: string;
  baseCommit: string;
  patchSha256: string;
  verifierBundleSha256: string;
  vmImageSha256: string;
};

/**
 * The signed verdict a verifier returns. `requestDigest` must equal the kernel's own
 * digest of the BlackBoxRequest it sent (per-field binding); the signature covers the
 * verdict + digests + key id + expiry. The kernel trusts ONLY this — never a guest self-report.
 */
export type BlackBoxAttestation = {
  version: 1;
  requestDigest: string;
  verdict: "pass" | "fail";
  observationsDigest: string;
  verifierKeyId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

/**
 * The seam an external black-box verifier plugs into. The kernel sends a request and
 * trusts only the returned signature + its bound fields. `MockAttestor` is the hermetic /
 * dev implementation; a real Firecracker attestor is a frozen future adapter.
 */
export interface Attestor {
  requestAttestation(request: BlackBoxRequest): Promise<BlackBoxAttestation>;
}
