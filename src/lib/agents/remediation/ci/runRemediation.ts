import { driveRepair, driveReproduction } from "../driver";
import type { Repairer } from "../repair";
import { claimRun, createRemediationRun, ingestIncident, transitionRun } from "../store";
import type { DefectSource } from "./defectSource";
import type { DraftPublisher } from "./githubDraft";
import type { OpenPr, PrTarget } from "./githubClient";

export type RunRemediationResult = {
  status: "no-defect" | "ALREADY_FIXED" | "NOT_REPRODUCIBLE" | "NEEDS_HUMAN" | "PROPOSED";
  pr: OpenPr | null;
};

/**
 * Drive one detection→fix→publish cycle: detect a defect, run it through the UNCHANGED kernel
 * (reproduce → repair → verify → needs_review draft), then mirror any draft to a real PR.
 * Every non-FIXING reproduction outcome and a non-green repair short-circuit with pr=null.
 */
export async function runRemediation(
  source: DefectSource,
  repairer: Repairer,
  publisher: DraftPublisher,
  opts: { target: PrTarget; worker?: string; leaseMs?: number; repeats?: number },
): Promise<RunRemediationResult> {
  const worker = opts.worker ?? "remediation-ci";
  const leaseMs = opts.leaseMs ?? 300_000;
  const report = await source.detect();
  if (!report) return { status: "no-defect", pr: null };

  const { repository, defaultBranch, fixture } = report;
  try {
    const incident = await ingestIncident({
      repository,
      defaultBranch,
      fingerprint: fixture.incident.fingerprint,
      payload: { ...fixture.incident, defectiveCommit: fixture.defectiveCommit },
    });
    const run = await createRemediationRun(incident.id);
    if (!(await claimRun(run.id, worker, leaseMs))) throw new Error("failed to claim run");
    await transitionRun(run.id, worker, "RECEIVED", "TRIAGING");
    await transitionRun(run.id, worker, "TRIAGING", "CLASSIFIED");

    const repro = await driveReproduction(run.id, worker, fixture, { repeats: opts.repeats ?? 2 });
    if (repro !== "FIXING") return { status: repro, pr: null };

    const outcome = await driveRepair(run.id, worker, fixture, repairer, { leaseMs, heartbeatMs: 15_000 });
    const pr = await publisher.publish({ incidentId: incident.id, target: opts.target });
    return { status: outcome, pr };
  } finally {
    await fixture.cleanup();
  }
}
