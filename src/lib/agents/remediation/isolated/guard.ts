import type { RegressionFixture } from "../fixtures";
import { isTrustedRepairer, type Repairer } from "../repair";
import { isIsolated } from "./dockerCheckRunner";

/**
 * Fail-closed isolation guard. Untrusted repairers (those lacking the unforgeable
 * trust brand — notably LlmRepairer) MUST drive BOTH runCheck AND runHoldout through
 * an isolated (Docker) runner — their written source executes inside those containers
 * and must never reach host secrets, the network, the worktree, or git metadata. The
 * kernel enforces this in runFixAttempt; this function is also available for early
 * script-level validation.
 */
export function assertIsolatedForUntrusted(repairer: Repairer, fixture: RegressionFixture): void {
  if (isTrustedRepairer(repairer)) return;
  const { runCheck, runHoldout } = fixture.substrate;
  if (!isIsolated(runCheck) || !isIsolated(runHoldout)) {
    throw new Error(
      "isolation guard: untrusted repairer requires isolated (Docker) runners for both " +
        "runCheck and runHoldout. Build the fixture with isolation: 'docker'.",
    );
  }
}
