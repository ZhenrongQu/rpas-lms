import { describe, expect, it, vi } from "vitest";
import { createRegressionFixture } from "./fixtures";
import { runFixAttempt } from "./fixAttempt";
import { fixtureRepairerFor, type Repairer } from "./repair";

const POLICY = {
  allowedPaths: ["src/score.mjs"],
  pinnedPaths: ["src/check.mjs"],
  readAllowlist: ["src/"],
};

// These tests do NOT mock ./isolated/guard — they exercise the REAL guard wired into
// runFixAttempt, so a regression that made the guard/trust registry reject everyone
// (or admit anyone) would fail here. The flow tests in driver/fixAttempt mock the guard
// away, so this file is the only hermetic coverage of the live kernel gate — both sides.
describe("runFixAttempt isolation wiring", () => {
  it("refuses an untrusted repairer on host runners before repair executes", async () => {
    const fixture = await createRegressionFixture();
    const repair = vi.fn<Repairer["repair"]>();
    const untrusted: Repairer = { repair };

    try {
      await expect(
        runFixAttempt(fixture, untrusted, { policy: POLICY, maxPatchBytes: 1_000_000 }),
      ).rejects.toThrow(/isolated/i);
      expect(repair).not.toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });

  it("admits a trusted repairer on host runners and drives it to green evidence", async () => {
    const fixture = await createRegressionFixture();

    try {
      // fixtureRepairerFor returns a trusted FixtureRepairer, so the guard must let it
      // run on the fixture's host script runner (no Docker) — proving the gate lets the
      // trusted oracle through rather than blanket-refusing.
      const evidence = await runFixAttempt(fixture, fixtureRepairerFor(fixture), {
        policy: POLICY,
        maxPatchBytes: 1_000_000,
      });
      expect(evidence.redBeforeMatches).toBe(true);
      expect(evidence.greenAfter).toBe(true);
      expect(evidence.holdoutPassed).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
