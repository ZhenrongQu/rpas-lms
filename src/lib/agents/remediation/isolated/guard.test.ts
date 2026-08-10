import { describe, expect, it } from "vitest";
import type { CheckRunner } from "../substrate";
import type { RegressionFixture } from "../fixtures";
import { fixtureRepairerFor } from "../repair";
import { LlmRepairer } from "../llm/repairer";
import { vitestCheckRunner } from "../real/vitestSubstrate";
import { dockerVitestCheckRunner } from "./dockerCheckRunner";
import { assertIsolatedForUntrusted } from "./guard";

// Only the substrate runners matter to the guard; they are never invoked.
const fx = (runCheck: CheckRunner, runHoldout: CheckRunner = runCheck): RegressionFixture =>
  ({ substrate: { runCheck, runHoldout } }) as unknown as RegressionFixture;

const oracle = fixtureRepairerFor({ sourceRelPath: "s", fixedSource: "x" });
const llm = new LlmRepairer();
const hostRunner = vitestCheckRunner("/origin", ["t"]);
const dockerRunner = dockerVitestCheckRunner({ image: "i", tests: ["t"] });

describe("assertIsolatedForUntrusted", () => {
  it("allows the trusted oracle on a host runner (trusted bypasses isolation check)", () => {
    expect(() => assertIsolatedForUntrusted(oracle, fx(hostRunner))).not.toThrow();
  });

  it("REFUSES an untrusted LLM repairer on a host runCheck (no fallback to host execution)", () => {
    expect(() => assertIsolatedForUntrusted(llm, fx(hostRunner))).toThrow(/isolated/i);
  });

  it("REFUSES an untrusted LLM repairer when runCheck is docker but runHoldout is host", () => {
    // Holdout also executes LLM-written code — both runners must be isolated.
    expect(() => assertIsolatedForUntrusted(llm, fx(dockerRunner, hostRunner))).toThrow(/isolated/i);
  });

  it("allows an untrusted LLM repairer when BOTH runCheck and runHoldout are isolated (Docker)", () => {
    expect(() => assertIsolatedForUntrusted(llm, fx(dockerRunner, dockerRunner))).not.toThrow();
  });
});
