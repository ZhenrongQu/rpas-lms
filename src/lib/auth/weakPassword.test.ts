import { describe, expect, it } from "vitest";
import { weakPasswordReason } from "./weakPassword";

describe("weakPasswordReason (SEC-13)", () => {
  it("flags common passwords", () => {
    expect(weakPasswordReason("password123")).toBe("too_common");
    expect(weakPasswordReason("qwerty123")).toBe("too_common");
    expect(weakPasswordReason("Password123")).toBe("too_common"); // case-insensitive
  });

  it("flags low-variety passwords (repeats and runs)", () => {
    expect(weakPasswordReason("aaaaaaaa")).toBe("low_variety");
    expect(weakPasswordReason("abcdefgh")).toBe("low_variety");
    expect(weakPasswordReason("hgfedcba")).toBe("low_variety");
  });

  it("flags passwords that embed the email local-part or username", () => {
    expect(weakPasswordReason("robbie2026", { username: "robbie" })).toBe("contains_identifier");
    expect(weakPasswordReason("xJohnSmith9", { email: "johnsmith@example.com" })).toBe("contains_identifier");
  });

  it("accepts a strong, non-obvious password", () => {
    expect(weakPasswordReason("Tr0ub4dour-Xj")).toBeNull();
    expect(weakPasswordReason("k9!mountain_River", { email: "pilot@example.com", username: "skyhawk" })).toBeNull();
  });
});
