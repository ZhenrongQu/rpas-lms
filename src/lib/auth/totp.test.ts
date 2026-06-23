import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "./totp";

// RFC 6238 reference secret "12345678901234567890" (ASCII) in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP (SEC-16)", () => {
  it("matches the RFC 6238 SHA-1 reference vector (T=59 → 287082)", () => {
    expect(verifyTotp(RFC_SECRET, "287082", { now: 59_000, window: 0 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, "000000", { now: 59_000, window: 0 })).toBe(false);
  });

  it("accepts the adjacent step within the skew window but not far ones", () => {
    // 30s later is the next step; window:1 should still accept the T=59 code? No —
    // verify the code generated for the previous step is accepted at the next.
    expect(verifyTotp(RFC_SECRET, "287082", { now: 59_000 + 30_000, window: 1 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, "287082", { now: 59_000 + 120_000, window: 1 })).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(verifyTotp(RFC_SECRET, "12345", { now: 59_000 })).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", { now: 59_000 })).toBe(false);
  });

  it("generates a 32-char base32 secret and a well-formed otpauth URI", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = totpAuthUri({ secret, account: "admin@x.com", issuer: "RPAS" });
    expect(uri).toContain("otpauth://totp/RPAS:admin%40x.com");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=RPAS");
  });
});
