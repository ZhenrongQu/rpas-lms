import { describe, expect, it } from "vitest";
import { buildAttestationRequest, verifyAttestation } from "./attestation";
import { MockAttestor } from "./attestation.testutil";
import type { BlackBoxRequest } from "./types";

function sampleRequest(overrides: Partial<BlackBoxRequest> = {}): BlackBoxRequest {
  return {
    ...buildAttestationRequest({
      runId: "run-1",
      nonce: "nonce-1",
      incidentFingerprint: "fp-1",
      baseCommit: "abc123",
      patch: "diff --git a b",
      substrateIdentity: "sub-1",
    }),
    ...overrides,
  };
}

describe("verifyAttestation", () => {
  it("accepts a valid pass attestation bound to the request", async () => {
    const attestor = new MockAttestor();
    const req = sampleRequest();
    const att = await attestor.requestAttestation(req);
    expect(verifyAttestation(req, att, attestor.knownKeys())).toEqual({ ok: true });
  });

  it("rejects an attestation whose request digest does not match a tampered field", async () => {
    const attestor = new MockAttestor();
    const att = await attestor.requestAttestation(sampleRequest());
    // Verify the SAME attestation against a request with a different patch → digest mismatch.
    const tampered = sampleRequest({ patchSha256: "deadbeef" });
    expect(verifyAttestation(tampered, att, attestor.knownKeys())).toEqual({ ok: false, reason: "request-digest-mismatch" });
  });

  it("blocks a replayed attestation issued for a different request (different nonce)", async () => {
    const attestor = new MockAttestor();
    const attForA = await attestor.requestAttestation(sampleRequest({ nonce: "nonce-A" }));
    const reqB = sampleRequest({ nonce: "nonce-B" });
    expect(verifyAttestation(reqB, attForA, attestor.knownKeys())).toEqual({ ok: false, reason: "request-digest-mismatch" });
  });

  it("rejects an unknown verifier key (trust anchor is separate from the attestor)", async () => {
    const attestor = new MockAttestor();
    const req = sampleRequest();
    const att = await attestor.requestAttestation(req);
    expect(verifyAttestation(req, att, new Map())).toEqual({ ok: false, reason: "unknown-verifier-key" });
  });

  it("rejects a tampered signed field (bad signature)", async () => {
    const attestor = new MockAttestor();
    const req = sampleRequest();
    const att = await attestor.requestAttestation(req);
    const forged = { ...att, observationsDigest: "tampered-after-signing" };
    expect(verifyAttestation(req, forged, attestor.knownKeys())).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a fail verdict even when signed and bound correctly", async () => {
    const attestor = new MockAttestor({ verdict: "fail" });
    const req = sampleRequest();
    const att = await attestor.requestAttestation(req);
    expect(verifyAttestation(req, att, attestor.knownKeys())).toEqual({ ok: false, reason: "verdict-fail" });
  });

  it("rejects an expired attestation", async () => {
    const attestor = new MockAttestor({ ttlMs: 1000 });
    const req = sampleRequest();
    const att = await attestor.requestAttestation(req);
    const future = new Date(Date.now() + 60_000);
    expect(verifyAttestation(req, att, attestor.knownKeys(), future)).toEqual({ ok: false, reason: "expired" });
  });
});
