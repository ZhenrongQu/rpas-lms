import { describe, expect, it, vi } from "vitest";
import { runSentryRemediation, SentryDefectSource, type SentryRunDeps } from "./runSentryRemediation";
import type { SentryIssue, SentrySource } from "./sentryIssue";
import type { RegressionFixture } from "../fixtures";

const mk = (id: string): SentryIssue => ({ id, title: "t", culprit: "", count: 1, firstSeen: "", lastSeen: "", error: { type: "TypeError", value: "x" }, frames: [], release: { current: "c", previous: "p" } });
const source = (issues: SentryIssue[]): SentrySource => ({ unresolvedIssues: async () => issues });
const repro = { kind: "reproducible" as const, sourceRelPath: "src/f.ts", fnName: "f", knownGoodCommit: "p", defectiveCommit: "c" };
const synth = { relPath: "src/__sentry_repro__.test.ts", source: "", testName: "n" };

describe("runSentryRemediation", () => {
  it("records an escalation and never synthesizes/remediates", async () => {
    const deps: SentryRunDeps = {
      classify: async () => ({ kind: "escalate", reason: "not-in-app" }),
      synthesize: vi.fn(), remediate: vi.fn(),
    };
    expect(await runSentryRemediation(source([mk("1")]), deps)).toEqual([{ issueId: "1", status: "NEEDS_HUMAN", reason: "not-in-app" }]);
    expect(deps.synthesize).not.toHaveBeenCalled();
    expect(deps.remediate).not.toHaveBeenCalled();
  });

  it("records synthesis-failed when the synthesizer returns null", async () => {
    const deps: SentryRunDeps = { classify: async () => repro, synthesize: async () => null, remediate: vi.fn() };
    expect(await runSentryRemediation(source([mk("2")]), deps)).toEqual([{ issueId: "2", status: "NEEDS_HUMAN", reason: "synthesis-failed" }]);
    expect(deps.remediate).not.toHaveBeenCalled();
  });

  it("remediates a reproducible+synthesized issue and records the run result", async () => {
    const deps: SentryRunDeps = {
      classify: async () => repro, synthesize: async () => synth,
      remediate: async () => ({ status: "NEEDS_HUMAN", pr: { number: 0, url: "(dry-run)" } }),
    };
    expect(await runSentryRemediation(source([mk("3")]), deps)).toEqual([{ issueId: "3", status: "NEEDS_HUMAN", pr: { number: 0, url: "(dry-run)" } }]);
  });
});

describe("SentryDefectSource", () => {
  it("returns exactly the one DefectReport it was built with", async () => {
    const fixture = { sourceRelPath: "src/f.ts" } as unknown as RegressionFixture;
    const r = await new SentryDefectSource({ repository: "o/r", defaultBranch: "main", fixture }).detect();
    expect(r).toEqual({ repository: "o/r", defaultBranch: "main", fixture });
  });
});
