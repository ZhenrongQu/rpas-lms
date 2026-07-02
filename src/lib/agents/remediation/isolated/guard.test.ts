import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../fixtures";
import { fixtureRepairerFor } from "../repair";
import { LlmRepairer } from "../llm/repairer";
import { vitestCheckRunner } from "../real/vitestSubstrate";
import { dockerVitestCheckRunner } from "./dockerCheckRunner";
import { assertIsolatedForUntrusted } from "./guard";

// Only the substrate.runCheck matters to the guard; the runners are never invoked.
const fx = (runCheck: RegressionFixture["substrate"]["runCheck"]): RegressionFixture =>
  ({ substrate: { runCheck } }) as unknown as RegressionFixture;

const oracle = fixtureRepairerFor({ sourceRelPath: "s", fixedSource: "x" });
const llm = new LlmRepairer();
const hostRunner = vitestCheckRunner("/origin", ["t"]);
const dockerRunner = dockerVitestCheckRunner({ image: "i", tests: ["t"] });

describe("assertIsolatedForUntrusted", () => {
  it("allows the trusted oracle on a host runner", () => {
    expect(() => assertIsolatedForUntrusted(oracle, fx(hostRunner))).not.toThrow();
  });

  it("REFUSES an untrusted LLM repairer on a host runner (no fallback to host execution)", () => {
    expect(() => assertIsolatedForUntrusted(llm, fx(hostRunner))).toThrow(/isolated/i);
  });

  it("allows an untrusted LLM repairer on an isolated (docker) runner", () => {
    expect(() => assertIsolatedForUntrusted(llm, fx(dockerRunner))).not.toThrow();
  });
});
