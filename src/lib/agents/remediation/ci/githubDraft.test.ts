import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../../db";
import { ingestIncident } from "../store";
import { DraftPublisher } from "./githubDraft";
import { MockGitHubClient } from "./githubClient";

afterEach(async () => {
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.incident.deleteMany();
});

/** A needs_review draft already written by the kernel (publishReviewDraft) for `incidentId`. */
async function seedDraft(incidentId: string, patch: string) {
  await prisma.externalAction.create({
    data: { kind: "draft_pr", incidentId, repository: "o/r", defaultBranch: "main", fingerprint: "fp", status: "needs_review", currentVersion: 1 },
  });
  const action = await prisma.externalAction.findFirstOrThrow({ where: { incidentId } });
  await prisma.externalActionVersion.create({
    data: { actionId: action.id, cycle: 1, version: 1, body: "b", patch, evidence: "{}" },
  });
}

describe("DraftPublisher", () => {
  const target = { baseRef: "origin/main", headBranch: "remediation/fp" };

  it("opens a real draft PR mirroring the needs_review version's patch", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    await seedDraft(inc.id, "PATCH-A");
    const gh = new MockGitHubClient();
    const pr = await new DraftPublisher(gh).publish({ incidentId: inc.id, target });
    expect(pr).toEqual({ number: 1, url: "https://x/1" });
    expect(gh.pushed).toEqual([{ headBranch: "remediation/fp", baseCommit: expect.any(String), patch: "PATCH-A", message: expect.any(String) }]);
    expect(gh.opened[0]!.labels).toEqual(["automated-remediation", "needs-human-review"]);
  });

  it("is idempotent: an existing open PR is updated, not duplicated", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    await seedDraft(inc.id, "PATCH-A");
    const gh = new MockGitHubClient();
    gh.existing = { number: 7, url: "https://x/7" };
    const pr = await new DraftPublisher(gh).publish({ incidentId: inc.id, target });
    expect(pr).toEqual({ number: 7, url: "https://x/7" });
    expect(gh.opened).toHaveLength(0); // updated the branch, did NOT open a second PR
    expect(gh.pushed).toHaveLength(1);
  });

  it("returns null when there is no needs_review draft (non-green outcome)", async () => {
    const inc = await ingestIncident({ repository: "o/r", defaultBranch: "main", fingerprint: "fp", payload: {} });
    const pr = await new DraftPublisher(new MockGitHubClient()).publish({ incidentId: inc.id, target });
    expect(pr).toBeNull();
  });
});
