import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { claimRun, createRemediationRun, ingestIncident } from "./store";
import { publishProposal, publishReviewDraft } from "./publish";
import type { RepairEvidence } from "./fixAttempt";

afterEach(async () => {
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

const EVIDENCE: RepairEvidence = {
  baseCommit: "x",
  reproductionHash: "h",
  reproductionIntact: true,
  redBeforeMatches: true,
  redBeforeSignature: null,
  greenAfter: true,
  changedFiles: ["src/score.mjs"],
  diffLines: 2,
  hasBinaryDiff: false,
  patch: "PATCH-A",
  patchBytes: 7,
  patchTooLarge: false,
  holdoutPassed: true,
};

async function incident(fingerprint: string) {
  return ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint, payload: {} });
}

/** A run parked at PROPOSING with a claimed lease and persisted evidence — the
 *  only state from which publishing is legitimate. */
async function proposingRun(fingerprint: string, patch: string, verificationProfile: string = "sandbox-fixture") {
  const inc = await incident(fingerprint);
  const run = await createRemediationRun(inc.id);
  await claimRun(run.id, "worker-a", 60_000);
  await prisma.remediationRun.update({
    where: { id: run.id },
    // Publishing is only legitimate for a sandbox-fixture target (allowlist). Tests that
    // exercise the reject path pass a production/unknown/undefined profile explicitly.
    data: {
      phase: "PROPOSING",
      evidence: JSON.stringify({ ...EVIDENCE, patch }),
      // sentinel "__NO_TARGET__" leaves target null (createRemediationRun default) —
      // NOT `undefined` as an arg, which would trigger the default param below.
      target: verificationProfile === "__NO_TARGET__" ? undefined : { verificationProfile },
    },
  });
  return run;
}

describe("publishProposal", () => {
  it("publishes the run's own persisted patch as a versioned open action", async () => {
    const run = await proposingRun("pub-one", "PATCH-A");
    const { actionId, version } = await publishProposal(run.id, "worker-a");
    expect(version).toBe(1);
    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("open");
    expect(action.currentVersion).toBe(1);
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.patch).toBe("PATCH-A");
  });

  it("is an idempotent no-op when the same cycle republishes", async () => {
    const run = await proposingRun("pub-replay", "PATCH-A");
    const { actionId } = await publishProposal(run.id, "worker-a");
    await publishProposal(run.id, "worker-a");
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.currentVersion).toBe(1);
  });

  it("appends a new version for a second cycle without rewriting history", async () => {
    const run1 = await proposingRun("pub-recur", "PATCH-A");
    const { actionId } = await publishProposal(run1.id, "worker-a");

    const run2 = await createRemediationRun(run1.incidentId); // cycle 2, same incident
    await claimRun(run2.id, "worker-a", 60_000);
    await prisma.remediationRun.update({
      where: { id: run2.id },
      data: { phase: "PROPOSING", evidence: JSON.stringify({ ...EVIDENCE, patch: "PATCH-B" }), target: { verificationProfile: "sandbox-fixture" } },
    });
    await publishProposal(run2.id, "worker-a");

    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.currentVersion).toBe(2);
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.patch)).toEqual(["PATCH-A", "PATCH-B"]); // v1 untouched
  });

  it("refuses to publish from a non-PROPOSING phase (no forged proposals)", async () => {
    const inc = await incident("pub-wrong-phase");
    const run = await createRemediationRun(inc.id); // phase RECEIVED
    await claimRun(run.id, "worker-a", 60_000);
    await expect(publishProposal(run.id, "worker-a")).rejects.toThrow(/not at PROPOSING/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses a worker that does not hold the lease", async () => {
    const run = await proposingRun("pub-not-owner", "PATCH-A");
    await expect(publishProposal(run.id, "worker-b")).rejects.toThrow(/lost lease/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  // Publish boundary is an ALLOWLIST: only sandbox-fixture may publish heuristic
  // evidence. A production / missing / unknown profile must be refused, even when the
  // run is parked at PROPOSING with green-looking evidence — no attestor exists yet.
  it("refuses to publish a production-black-box run (no valid attestation)", async () => {
    const run = await proposingRun("pub-production", "PATCH-A", "production-black-box");
    await expect(publishProposal(run.id, "worker-a")).rejects.toThrow(/black-box attestation/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses to publish a run whose target has no profile (legacy/missing → fail closed)", async () => {
    const run = await proposingRun("pub-missing", "PATCH-A", "__NO_TARGET__");
    await expect(publishProposal(run.id, "worker-a")).rejects.toThrow(/black-box attestation/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses to publish a run with an unknown profile value (allowlist, not denylist)", async () => {
    const run = await proposingRun("pub-unknown", "PATCH-A", "totally-made-up");
    await expect(publishProposal(run.id, "worker-a")).rejects.toThrow(/black-box attestation/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });
});

/** A production-black-box run parked at VERIFYING with green (local-gate-passing) evidence —
 *  the state from which an untrusted author's candidate is surfaced as a needs-review draft. */
async function verifyingProductionRun(fingerprint: string, patch: string, evidence: Partial<RepairEvidence> = {}) {
  const inc = await incident(fingerprint);
  const run = await createRemediationRun(inc.id);
  await claimRun(run.id, "worker-a", 60_000);
  await prisma.remediationRun.update({
    where: { id: run.id },
    data: {
      phase: "VERIFYING",
      evidence: JSON.stringify({ ...EVIDENCE, ...evidence, patch }),
      target: { verificationProfile: "production-black-box" },
    },
  });
  return run;
}

describe("publishReviewDraft", () => {
  it("files an untrusted author's green candidate as a needs_review draft holding the real patch", async () => {
    const run = await verifyingProductionRun("draft-ok", "PATCH-CANDIDATE");
    const { actionId, version } = await publishReviewDraft(run.id, "worker-a");
    expect(version).toBe(1);
    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("needs_review"); // NOT "open" — never conflated with an approved proposal
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.patch).toBe("PATCH-CANDIDATE");
  });

  it("refuses a sandbox-fixture run (that path takes the approved-proposal route, not a draft)", async () => {
    const inc = await incident("draft-sandbox");
    const run = await createRemediationRun(inc.id);
    await claimRun(run.id, "worker-a", 60_000);
    await prisma.remediationRun.update({
      where: { id: run.id },
      data: { phase: "VERIFYING", evidence: JSON.stringify({ ...EVIDENCE, patch: "P" }), target: { verificationProfile: "sandbox-fixture" } },
    });
    await expect(publishReviewDraft(run.id, "worker-a")).rejects.toThrow(/not a production-black-box run/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses to surface a non-green candidate (holdout failed)", async () => {
    const run = await verifyingProductionRun("draft-notgreen", "P", { holdoutPassed: false });
    await expect(publishReviewDraft(run.id, "worker-a")).rejects.toThrow(/did not pass local gates/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses from a non-VERIFYING phase", async () => {
    const run = await proposingRun("draft-wrong-phase", "P", "production-black-box");
    await expect(publishReviewDraft(run.id, "worker-a")).rejects.toThrow(/not at VERIFYING/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("refuses a worker that does not hold the lease", async () => {
    const run = await verifyingProductionRun("draft-not-owner", "P");
    await expect(publishReviewDraft(run.id, "worker-b")).rejects.toThrow(/lost lease/);
    expect(await prisma.externalActionVersion.count()).toBe(0);
  });

  it("is an idempotent no-op when the same cycle re-surfaces", async () => {
    const run = await verifyingProductionRun("draft-replay", "PATCH-CANDIDATE");
    const { actionId } = await publishReviewDraft(run.id, "worker-a");
    await publishReviewDraft(run.id, "worker-a");
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
  });
});
