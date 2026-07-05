import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { attestationSigningBytes, requestDigest } from "./attestation";
import type { Attestor, BlackBoxAttestation, BlackBoxRequest } from "./types";

/**
 * Hermetic test attestor: holds an Ed25519 keypair and signs a verdict bound to the
 * request. It exercises the attestation contract, binding, and signature path
 * deterministically. It is TEST-ONLY on purpose — it performs no real black-box check,
 * so it is not exported from the production `attestation` module and cannot be wired into
 * the live authorization path. A real Firecracker attestor (a verdict computed OUTSIDE the
 * guest) is a frozen future adapter; until it exists, production-black-box runs fail closed
 * to NEEDS_HUMAN. Its public key is exposed via `knownKeys()` for a test's trust anchor.
 */
export class MockAttestor implements Attestor {
  readonly keyId: string;
  private readonly priv: KeyObject;
  private readonly pub: KeyObject;
  private readonly verdict: "pass" | "fail";
  private readonly ttlMs: number;

  constructor(opts: { keyId?: string; verdict?: "pass" | "fail"; ttlMs?: number } = {}) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.priv = privateKey;
    this.pub = publicKey;
    this.keyId = opts.keyId ?? `mock-${randomUUID().slice(0, 8)}`;
    this.verdict = opts.verdict ?? "pass";
    this.ttlMs = opts.ttlMs ?? 5 * 60_000;
  }

  /** The trust anchor a test uses to verify this attestor's signatures. */
  knownKeys(): Map<string, KeyObject> {
    return new Map([[this.keyId, this.pub]]);
  }

  async requestAttestation(request: BlackBoxRequest): Promise<BlackBoxAttestation> {
    const now = Date.now();
    const core: Omit<BlackBoxAttestation, "signature"> = {
      version: 1,
      requestDigest: requestDigest(request),
      verdict: this.verdict,
      observationsDigest: createHash("sha256").update(`mock-observations:${request.nonce}`).digest("hex"),
      verifierKeyId: this.keyId,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
    return { ...core, signature: sign(null, attestationSigningBytes(core), this.priv).toString("base64") };
  }
}
