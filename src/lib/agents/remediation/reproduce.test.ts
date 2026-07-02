import { afterEach, describe, expect, it } from "vitest";
import { createRegressionFixture, type RegressionFixture } from "./fixtures";
import { classifyOnLatestMain, reproduce } from "./reproduce";
import { nodeStackStrategy, type FailureSignature } from "./signature";

const created: RegressionFixture[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((fixture) => fixture.cleanup()));
});

describe("reproduce", () => {
  it("accepts a stable, matching reproduction", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    const result = await reproduce(fixture, { repeats: 2 });
    expect(result.accepted).toBe(true);
    const sig = result.signature as FailureSignature;
    expect(sig.errorType).toBe("TypeError");
    expect(sig.applicationFrames[0]).toEqual({ module: "score.mjs", symbol: "score" });
  });

  it("rejects when the failure signature does not match the incident", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    // matching now lives in the substrate's signature strategy: point it at a
    // different symbol so the observed defect no longer matches.
    const wrong = {
      ...fixture,
      substrate: { ...fixture.substrate, signature: nodeStackStrategy({ ...fixture.incident, symbol: "notScore" }) },
    };
    const result = await reproduce(wrong, { repeats: 2 });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("signature-mismatch");
  });

  it("rejects when the known-good control is itself broken", async () => {
    const fixture = await createRegressionFixture({ variant: "control-broken" });
    created.push(fixture);
    const result = await reproduce(fixture, { repeats: 2 });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("control-failed");
  });
});

describe("classifyOnLatestMain", () => {
  it("returns FIXING when the defect still reproduces on main", async () => {
    const fixture = await createRegressionFixture();
    created.push(fixture);
    expect(await classifyOnLatestMain(fixture)).toBe("FIXING");
  });

  it("returns ALREADY_FIXED when main is green", async () => {
    const fixture = await createRegressionFixture({ variant: "already-fixed" });
    created.push(fixture);
    expect(await classifyOnLatestMain(fixture)).toBe("ALREADY_FIXED");
  });

  it("returns NEEDS_HUMAN when the test no longer applies on main", async () => {
    const fixture = await createRegressionFixture({ variant: "non-portable" });
    created.push(fixture);
    expect(await classifyOnLatestMain(fixture)).toBe("NEEDS_HUMAN");
  });
});
