import { afterEach, describe, expect, it, vi } from "vitest";
import { streamConfig } from "./cloudflareStream";

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
