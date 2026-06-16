import { describe, expect, it, vi } from "vitest";

// Force both providers "available" so the native-shell test proves they get hidden.
// (The bare test env has no OAuth creds, so the real status is all-false on its own.)
vi.mock("../../../../../src/lib/auth/oauthConfig", () => ({
  getOAuthProviderStatus: () => ({ google: true, apple: true }),
}));

import { GET } from "./route";

const url = "http://localhost/api/auth/oauth/status";

describe("GET /api/auth/oauth/status", () => {
  it("returns configured provider availability for browser requests", async () => {
    const res = await GET(new Request(url));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: { google: true, apple: true } });
  });

  it("hides third-party providers for the native app shell (Google blocks WebView OAuth)", async () => {
    const res = await GET(new Request(url, { headers: { "user-agent": "Mozilla/5.0 RPASApp" } }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: { google: false, apple: false } });
  });
});
