import { describe, it, expect } from "vitest";
import { allocateQuotas } from "./quota";
import { SUBJECT_WEIGHTS } from "./config";
import { MODULE_IDS } from "../content/types";

describe("allocateQuotas", () => {
  it("sums exactly to the total for a Basic exam", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    const sum = MODULE_IDS.reduce((acc, m) => acc + q[m], 0);
    expect(sum).toBe(35);
  });

  it("sums exactly to the total for an Advanced exam", () => {
    const q = allocateQuotas(50, SUBJECT_WEIGHTS.ADVANCED);
    const sum = MODULE_IDS.reduce((acc, m) => acc + q[m], 0);
    expect(sum).toBe(50);
  });

  it("gives air-law the largest quota (highest weight)", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    const max = Math.max(...MODULE_IDS.map((m) => q[m]));
    expect(q["air-law"]).toBe(max);
  });

  it("never assigns a negative quota", () => {
    const q = allocateQuotas(35, SUBJECT_WEIGHTS.BASIC);
    for (const m of MODULE_IDS) expect(q[m]).toBeGreaterThanOrEqual(0);
  });
});
