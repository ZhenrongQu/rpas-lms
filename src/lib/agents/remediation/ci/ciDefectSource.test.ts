import { describe, expect, it } from "vitest";
import type { RegressionFixture } from "../fixtures";
import { CiDefectSource, type CiSourceDeps, type FixtureBuilder } from "./ciDefectSource";

const reportJson = JSON.stringify({
  success: false,
  testResults: [{ name: "/r/src/lib/exam/grade.test.ts", assertionResults: [{ title: "dupes", status: "failed", failureMessages: ["AssertionError: x"] }] }],
});

// A single-source-file fixture stub — the real builder is covered by commitPairFixture.test.ts.
const okBuilder: FixtureBuilder = async () => ({ sourceRelPath: "src/lib/exam/grade.ts", incident: { fingerprint: "fp" } } as unknown as RegressionFixture);

function deps(over: Partial<CiSourceDeps> = {}): CiSourceDeps {
  return {
    reportJson,
    event: { kind: "pull_request", headSha: "head", baseRef: "origin/main" },
    originRepo: "/r",
    repository: "o/r",
    defaultBranch: "main",
    image: "img:tag",
    git: { mergeBase: async () => "good" },
    history: { lastGreenCommit: async () => null },
    repo: { changedFiles: async () => ({ sourceFiles: ["src/lib/exam/grade.ts"], testFiles: [] }), relatedTestFiles: async () => [] },
    buildFixture: okBuilder,
    ...over,
  };
}

describe("CiDefectSource", () => {
  it("detects a defect report with a ready fixture", async () => {
    const r = await new CiDefectSource(deps()).detect();
    expect(r?.repository).toBe("o/r");
    expect(r?.fixture.sourceRelPath).toBe("src/lib/exam/grade.ts");
  });

  it("returns null when the report has no failing test", async () => {
    const r = await new CiDefectSource(deps({ reportJson: '{"success":true,"testResults":[]}' })).detect();
    expect(r).toBeNull();
  });

  it("returns null when no baseline resolves", async () => {
    const r = await new CiDefectSource(deps({ event: { kind: "push", branch: "main", headSha: "head" } })).detect();
    expect(r).toBeNull(); // history.lastGreenCommit → null
  });

  it("returns null when the builder rejects the diff (out of v1 scope)", async () => {
    const r = await new CiDefectSource(deps({ buildFixture: async () => null })).detect();
    expect(r).toBeNull();
  });
});
