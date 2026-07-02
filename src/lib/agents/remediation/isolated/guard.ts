import type { RegressionFixture } from "../fixtures";
import { FixtureRepairer, type Repairer } from "../repair";
import { isIsolated } from "./dockerCheckRunner";

/**
 * Fail-closed production guard. Only the deterministic oracle (FixtureRepairer) is
 * trusted to run against a non-isolated (host) check runner. ANY other author —
 * notably LlmRepairer, whose written source `run_check` then EXECUTES — MUST drive
 * an isolated (Docker) runner, or its code would run on the host with the worker's
 * secrets / filesystem / network. Call this at the eval/production entry, before
 * driveRepair, so an untrusted author can never fall back to host execution.
 */
export function assertIsolatedForUntrusted(repairer: Repairer, fixture: RegressionFixture): void {
  const trusted = repairer instanceof FixtureRepairer;
  if (!trusted && !isIsolated(fixture.substrate.runCheck)) {
    throw new Error(
      "refusing to run an untrusted repairer against a non-isolated check runner: " +
        "its executed code would run on the host. Build the fixture with isolation: 'docker'.",
    );
  }
}
