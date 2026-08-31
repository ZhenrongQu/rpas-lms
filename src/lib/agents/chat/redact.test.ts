import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("removes email addresses", () => {
    expect(redact("email me at jane.doe+rpas@example.co.uk please")).toBe(
      "email me at [email] please",
    );
  });

  it("removes phone-length digit runs, however they are punctuated", () => {
    expect(redact("call +1 (604) 555-0134")).toBe("call [number]");
    expect(redact("my number is 6045550134")).toBe("my number is [number]");
  });

  // The reason the threshold is 10 digits and not 5: this domain is made of short
  // numbers, and a log that eats them is useless for grading answers.
  it("leaves the short numbers this domain is built on alone", () => {
    const domain = "Under CAR 901.11 stay below 400 ft AGL, squawk 1200, monitor 121.5 MHz";
    expect(redact(domain)).toBe(domain);
  });

  it("leaves ordinary text untouched", () => {
    expect(redact("What is the minimum visibility for VLOS operations?")).toBe(
      "What is the minimum visibility for VLOS operations?",
    );
  });
});
