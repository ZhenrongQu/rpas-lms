import { describe, expect, it } from "vitest";
import { classifySentryIssue } from "./triage";
import type { SentryRepo } from "./sentryRepo";
import type { SentryIssue } from "./sentryIssue";

function repo(over: Partial<SentryRepo> = {}): SentryRepo {
  return {
    commitExists: async () => true,
    isAncestor: async () => true,
    changedSourceFiles: async () => ["src/lib/exam/grade.ts"],
    fileExistsAt: async () => true,
    readFileAt: async () => "export function isAnswerCorrect() {}",
    hasNamedExport: async () => true,
    ...over,
  };
}
function issue(over: Partial<SentryIssue> = {}): SentryIssue {
  return {
    id: "1", title: "t", culprit: "", count: 1, firstSeen: "", lastSeen: "",
    error: { type: "TypeError", value: "x" },
    frames: [{ function: "isAnswerCorrect", filename: "src/lib/exam/grade.ts", lineno: 1, inApp: true }],
    release: { current: "cur", previous: "prev" },
    ...over,
  };
}

describe("classifySentryIssue", () => {
  it("accepts a regression-shaped, single-file, in-app, named-export TypeError", async () => {
    expect(await classifySentryIssue(issue(), repo())).toEqual({
      kind: "reproducible", sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect", knownGoodCommit: "prev", defectiveCommit: "cur",
    });
  });
  it("escalates no-previous-release", async () => {
    expect(await classifySentryIssue(issue({ release: { current: "cur", previous: null } }), repo())).toEqual({ kind: "escalate", reason: "no-previous-release" });
  });
  it("escalates unresolvable-or-nonlinear-release when previous is not an ancestor", async () => {
    expect(await classifySentryIssue(issue(), repo({ isAncestor: async () => false }))).toEqual({ kind: "escalate", reason: "unresolvable-or-nonlinear-release" });
  });
  it("escalates not-in-app when no in-app frame", async () => {
    expect(await classifySentryIssue(issue({ frames: [{ function: "f", filename: "node_modules/x.js", lineno: 1, inApp: false }] }), repo())).toEqual({ kind: "escalate", reason: "not-in-app" });
  });
  it("escalates unsynthesizable-error-class", async () => {
    expect(await classifySentryIssue(issue({ error: { type: "NetworkError", value: "x" } }), repo())).toEqual({ kind: "escalate", reason: "unsynthesizable-error-class" });
  });
  it("escalates source-not-in-repo when the frame file is absent / out of src", async () => {
    expect(await classifySentryIssue(issue(), repo({ fileExistsAt: async () => false }))).toEqual({ kind: "escalate", reason: "source-not-in-repo" });
  });
  it("escalates unsupported-multi-file-regression", async () => {
    expect(await classifySentryIssue(issue(), repo({ changedSourceFiles: async () => ["src/lib/exam/grade.ts", "src/other.ts"] }))).toEqual({ kind: "escalate", reason: "unsupported-multi-file-regression" });
  });
  it("escalates frame-not-named-export", async () => {
    expect(await classifySentryIssue(issue(), repo({ hasNamedExport: async () => false }))).toEqual({ kind: "escalate", reason: "frame-not-named-export" });
  });
});
