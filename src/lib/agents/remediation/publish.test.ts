import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { createRemediationRun, ingestIncident } from "./store";
import { publishProposal } from "./publish";

afterEach(async () => {
  await prisma.externalActionVersion.deleteMany();
  await prisma.externalAction.deleteMany();
  await prisma.remediationRun.deleteMany();
  await prisma.incident.deleteMany();
});

async function incident(fingerprint: string) {
  return ingestIncident({ repository: "rpas-lms", defaultBranch: "main", fingerprint, payload: {} });
}

describe("publishProposal", () => {
  it("creates one open action with a versioned patch", async () => {
    const inc = await incident("pub-one");
    const run = await createRemediationRun(inc.id);
    const { actionId, version } = await publishProposal(run.id, { body: "b", patch: "PATCH-A", evidence: "{}" });
    expect(version).toBe(1);
    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("open");
    expect(action.currentVersion).toBe(1);
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.patch).toBe("PATCH-A");
  });

  it("is an idempotent no-op when the same cycle republishes", async () => {
    const inc = await incident("pub-replay");
    const run = await createRemediationRun(inc.id);
    const { actionId } = await publishProposal(run.id, { body: "b", patch: "PATCH-A", evidence: "{}" });
    await publishProposal(run.id, { body: "b", patch: "PATCH-A", evidence: "{}" });
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId } });
    expect(versions).toHaveLength(1);
    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.currentVersion).toBe(1);
  });

  it("appends a new version for a second cycle without rewriting history", async () => {
    const inc = await incident("pub-recur");
    const run1 = await createRemediationRun(inc.id);
    const { actionId } = await publishProposal(run1.id, { body: "b", patch: "PATCH-A", evidence: "{}" });
    const run2 = await createRemediationRun(inc.id); // cycle 2
    await publishProposal(run2.id, { body: "b", patch: "PATCH-B", evidence: "{}" });

    const action = await prisma.externalAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.currentVersion).toBe(2);
    const versions = await prisma.externalActionVersion.findMany({ where: { actionId }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.patch)).toEqual(["PATCH-A", "PATCH-B"]); // v1 untouched
  });
});
