import { createHash, verify, type KeyObject } from "node:crypto";
import type { BlackBoxAttestation, BlackBoxRequest } from "./types";

/**
 * Black-box attestation: the kernel sends a BlackBoxRequest bound to exactly this run /
 * patch / verifier bundle / VM image, and trusts ONLY a signed attestation whose
 * `requestDigest` matches and whose signature verifies under a SEPARATELY-configured
 * trust anchor (never a key the attestor supplies inline). This closes the white-box
 * self-attestation hole: a verdict cannot be forged by the code under test, nor replayed
 * for a different run/patch/bundle/image.
 */

/** Fixed field order so digests/signatures are stable regardless of object key order. */
function canonicalRequest(r: BlackBoxRequest): string {
  return JSON.stringify([
    r.version,
    r.runId,
    r.nonce,
    r.incidentFingerprint,
    r.baseCommit,
    r.patchSha256,
    r.verifierBundleSha256,
    r.vmImageSha256,
  ]);
}

export function requestDigest(r: BlackBoxRequest): string {
  return createHash("sha256").update(canonicalRequest(r)).digest("hex");
}

/** Everything the signature covers — the whole attestation EXCEPT the signature itself.
 *  Exported so an attestor adapter (the real Firecracker verifier, or the test MockAttestor)
 *  signs over exactly the bytes the kernel verifies — no drift-prone duplicate serializer. */
export function attestationSigningBytes(a: Omit<BlackBoxAttestation, "signature">): Buffer {
  return Buffer.from(
    JSON.stringify([a.version, a.requestDigest, a.verdict, a.observationsDigest, a.verifierKeyId, a.issuedAt, a.expiresAt]),
  );
}

export type AttestationVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Kernel-side verification. Fail closed on ANY gap: the attestation must bind to THIS
 * request (`requestDigest` equals our own digest of what we sent), be signed by a key in
 * the trust anchor, carry verdict "pass", and be unexpired. A replayed attestation (for a
 * different run/patch/bundle/image, hence a different request) fails the digest check.
 */
export function verifyAttestation(
  request: BlackBoxRequest,
  attestation: BlackBoxAttestation,
  knownKeys: Map<string, KeyObject>,
  now: Date = new Date(),
): AttestationVerdict {
  if (attestation.version !== 1) return { ok: false, reason: "unsupported-version" };
  if (attestation.requestDigest !== requestDigest(request)) return { ok: false, reason: "request-digest-mismatch" };
  const key = knownKeys.get(attestation.verifierKeyId);
  if (!key) return { ok: false, reason: "unknown-verifier-key" };
  let sigOk = false;
  try {
    sigOk = verify(null, attestationSigningBytes(attestation), key, Buffer.from(attestation.signature, "base64"));
  } catch {
    return { ok: false, reason: "bad-signature" };
  }
  if (!sigOk) return { ok: false, reason: "bad-signature" };
  if (attestation.verdict !== "pass") return { ok: false, reason: `verdict-${attestation.verdict}` };
  if (!(new Date(attestation.expiresAt).getTime() > now.getTime())) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * Build the request the kernel will send to a real black-box verifier. The `nonce` is
 * generated ONCE by the caller and frozen, so a resume re-requests the identical request.
 * The verifier-bundle / VM-image digests are placeholders derived from the frozen substrate
 * identity until a real Firecracker verifier exists — deterministic and still binding. Part
 * of the frozen contract; not yet wired into the driver (production-black-box → NEEDS_HUMAN).
 */
export function buildAttestationRequest(input: {
  runId: string;
  nonce: string;
  incidentFingerprint: string;
  baseCommit: string;
  patch: string;
  substrateIdentity: string;
}): BlackBoxRequest {
  const h = (s: string) => createHash("sha256").update(s).digest("hex");
  return {
    version: 1,
    runId: input.runId,
    nonce: input.nonce,
    incidentFingerprint: input.incidentFingerprint,
    baseCommit: input.baseCommit,
    patchSha256: h(input.patch),
    verifierBundleSha256: h(`verifier-bundle:${input.substrateIdentity}`),
    vmImageSha256: h(`vm-image:${input.substrateIdentity}`),
  };
}
