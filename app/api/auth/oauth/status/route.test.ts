import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/auth/oauth/status", () => {
  it("returns provider availability without exposing credentials", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      providers: {
        google: false,
        apple: false,
      },
    });
  });
});
