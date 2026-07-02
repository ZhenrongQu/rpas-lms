import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state";
import { REMEDIATION_PHASES, TERMINAL_PHASES, type RemediationPhase } from "./types";

describe("remediation phase state machine", () => {
  const forward: Array<[RemediationPhase, RemediationPhase]> = [
    ["RECEIVED", "TRIAGING"],
    ["TRIAGING", "CLASSIFIED"],
    ["CLASSIFIED", "REPRODUCING"],
    ["REPRODUCING", "FIXING"],
    ["FIXING", "VERIFYING"],
    ["VERIFYING", "PROPOSING"],
    ["PROPOSING", "PROPOSED"],
  ];

  it.each(forward)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ["REPRODUCING", "NOT_REPRODUCIBLE"],
    ["REPRODUCING", "ALREADY_FIXED"],
    ["REPRODUCING", "NEEDS_HUMAN"],
    ["FIXING", "NEEDS_HUMAN"],
    ["VERIFYING", "NEEDS_HUMAN"],
    ["TRIAGING", "FAILED"],
    ["VERIFYING", "FAILED"],
    ["CLASSIFIED", "CANCELLED"],
  ] satisfies Array<[RemediationPhase, RemediationPhase]>)
    ("allows terminal edge %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

  it.each(TERMINAL_PHASES)("does not leave terminal state %s", (from) => {
    for (const to of REMEDIATION_PHASES) expect(canTransition(from, to)).toBe(false);
  });

  it("rejects skipped and backward phases", () => {
    expect(canTransition("RECEIVED", "FIXING")).toBe(false);
    expect(canTransition("VERIFYING", "FIXING")).toBe(false);
    expect(() => assertTransition("RECEIVED", "FIXING")).toThrow(
      "invalid remediation transition RECEIVED → FIXING",
    );
  });
});
