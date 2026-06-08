import { describe, expect, it } from "vitest";
import { getOAuthProviderCredentials, getOAuthProviderStatus } from "./oauthConfig";

describe("oauth provider configuration", () => {
  it("treats providers as disabled when either credential is missing or blank", () => {
    const env = {
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "",
      APPLE_CLIENT_ID: "   ",
      APPLE_CLIENT_SECRET: "apple-secret",
    };

    expect(getOAuthProviderStatus(env)).toEqual({ google: false, apple: false });
    expect(getOAuthProviderCredentials(env)).toEqual({});
  });

  it("returns trimmed credentials only for fully configured providers", () => {
    const env = {
      GOOGLE_CLIENT_ID: " google-id ",
      GOOGLE_CLIENT_SECRET: " google-secret ",
      APPLE_CLIENT_ID: "apple-id",
      APPLE_CLIENT_SECRET: "apple-secret",
    };

    expect(getOAuthProviderStatus(env)).toEqual({ google: true, apple: true });
    expect(getOAuthProviderCredentials(env)).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      apple: { clientId: "apple-id", clientSecret: "apple-secret" },
    });
  });
});
