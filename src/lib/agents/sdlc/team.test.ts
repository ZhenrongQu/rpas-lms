import { describe, it, expect } from "vitest";
import { assignOwner } from "./team";

describe("assignOwner", () => {
  it("routes by path prefix", () => {
    expect(assignOwner("src/lib/exam/score.ts")).toContain("elena");
    expect(assignOwner("src/lib/payments/stripeClient.ts")).toContain("priya");
    expect(assignOwner("src/components/results/X.tsx")).toContain("leo");
  });

  it("longest matching prefix wins in a multi-path string", () => {
    // src/lib/exam (12) beats prisma (6)
    expect(assignOwner("src/lib/exam/store.ts, prisma/schema.prisma")).toContain("elena");
  });

  it("falls back to triage for an unknown area", () => {
    expect(assignOwner("vendor/unknown/thing")).toContain("triage");
  });
});
