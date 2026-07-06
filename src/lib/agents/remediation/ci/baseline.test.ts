import { describe, expect, it } from "vitest";
import { resolveBaseline, type CiHistory, type GitOps } from "./baseline";

const git: GitOps = { mergeBase: async (_a, _b) => "base-sha" };

describe("resolveBaseline", () => {
  it("PR: known-good = merge-base(base, head), defective = head", async () => {
    const history: CiHistory = { lastGreenCommit: async () => null };
    const b = await resolveBaseline({ kind: "pull_request", headSha: "head-sha", baseRef: "origin/main" }, git, history);
    expect(b).toEqual({ knownGoodCommit: "base-sha", defectiveCommit: "head-sha" });
  });

  it("push:main: known-good = last green commit, defective = head", async () => {
    const history: CiHistory = { lastGreenCommit: async (_branch, before) => (before === "head-sha" ? "green-sha" : null) };
    const b = await resolveBaseline({ kind: "push", branch: "main", headSha: "head-sha" }, git, history);
    expect(b).toEqual({ knownGoodCommit: "green-sha", defectiveCommit: "head-sha" });
  });

  it("push:main with no prior green run → null (no baseline)", async () => {
    const history: CiHistory = { lastGreenCommit: async () => null };
    expect(await resolveBaseline({ kind: "push", branch: "main", headSha: "head-sha" }, git, history)).toBeNull();
  });
});
