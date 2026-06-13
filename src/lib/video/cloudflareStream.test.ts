import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";
import { streamConfig, signPlaybackToken } from "./cloudflareStream";

afterEach(() => vi.unstubAllEnvs());

describe("streamConfig", () => {
  it("reads env and base64-decodes the signing key PEM", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";
    vi.stubEnv("CF_ACCOUNT_ID", "acct");
    vi.stubEnv("CF_STREAM_API_TOKEN", "tok");
    vi.stubEnv("CF_STREAM_CUSTOMER_CODE", "code");
    vi.stubEnv("CF_STREAM_SIGNING_KEY_ID", "kid");
    vi.stubEnv("CF_STREAM_SIGNING_KEY_PEM", Buffer.from(pem).toString("base64"));
    vi.stubEnv("CF_STREAM_WEBHOOK_SECRET", "secret");

    const cfg = streamConfig();
    expect(cfg.accountId).toBe("acct");
    expect(cfg.signingKeyId).toBe("kid");
    expect(cfg.signingKeyPem).toBe(pem);
  });

  it("throws when a required var is missing", () => {
    vi.stubEnv("CF_ACCOUNT_ID", "");
    expect(() => streamConfig()).toThrow();
  });
});

describe("signPlaybackToken", () => {
  it("signs an RS256 JWT whose sub is the video uid and verifies with the public key", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const spki = await exportSPKI(publicKey);

    const token = await signPlaybackToken({
      videoUid: "vid-123",
      keyId: "key-abc",
      privateKeyPem: pem,
      expiresInSec: 3600,
    });

    const { payload, protectedHeader } = await jwtVerify(token, await importSPKI(spki, "RS256"));
    expect(payload.sub).toBe("vid-123");
    expect(protectedHeader.kid).toBe("key-abc");
    expect(typeof payload.exp).toBe("number");
  });
});
