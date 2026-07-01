import { describe, it, expect } from "vitest";
import { shouldTriage } from "./recovery";

const now = 1_700_000_000_000;

describe("shouldTriage", () => {
  it("triages an issue with no prior run", () => {
    expect(shouldTriage(null, now)).toBe(true);
  });

  it("skips a completed triage (terminal success)", () => {
    expect(shouldTriage({ status: "done", updatedAt: new Date(now) }, now)).toBe(false);
  });

  it("retries a failed triage", () => {
    expect(shouldTriage({ status: "failed", updatedAt: new Date(now) }, now)).toBe(true);
  });

  it("skips a fresh running triage (a live process may own it)", () => {
    expect(shouldTriage({ status: "running", updatedAt: new Date(now) }, now, 10_000)).toBe(false);
  });

  it("reclaims a stale running triage (the process crashed)", () => {
    expect(shouldTriage({ status: "running", updatedAt: new Date(now - 20_000) }, now, 10_000)).toBe(true);
  });
});
