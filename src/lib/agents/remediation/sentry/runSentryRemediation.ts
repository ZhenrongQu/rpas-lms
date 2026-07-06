import type { OpenPr } from "../ci/githubClient";
import type { RunRemediationResult } from "../ci/runRemediation";
import type { SentryIssue, SentrySource } from "./sentryIssue";
import type { SynthesizedTest } from "./synthesizer";
import type { TriageResult } from "./triage";
export { SentryDefectSource } from "./sentryDefectSource";

type Reproducible = Extract<TriageResult, { kind: "reproducible" }>;

export type SentryRecord = { issueId: string; status: string; reason?: string; pr?: OpenPr | null };

export type SentryRunDeps = {
  classify: (issue: SentryIssue) => Promise<TriageResult>;
  synthesize: (issue: SentryIssue, triaged: Reproducible) => Promise<SynthesizedTest | null>;
  remediate: (issue: SentryIssue, triaged: Reproducible, synth: SynthesizedTest) => Promise<RunRemediationResult>;
};

/**
 * Per issue: triage → (escalate: record reason) / (reproducible: synthesize → (fail: record
 * synthesis-failed) / (ok: remediate via the reused kernel+spine, record the run result)).
 * The escalation reason lives HERE, not in DefectSource.detect (which stays DefectReport|null).
 */
export async function runSentryRemediation(source: SentrySource, deps: SentryRunDeps): Promise<SentryRecord[]> {
  const records: SentryRecord[] = [];
  for (const issue of await source.unresolvedIssues()) {
    const triaged = await deps.classify(issue);
    if (triaged.kind === "escalate") {
      records.push({ issueId: issue.id, status: "NEEDS_HUMAN", reason: triaged.reason });
      continue;
    }
    const synth = await deps.synthesize(issue, triaged);
    if (!synth) {
      records.push({ issueId: issue.id, status: "NEEDS_HUMAN", reason: "synthesis-failed" });
      continue;
    }
    const result = await deps.remediate(issue, triaged, synth);
    records.push({ issueId: issue.id, status: result.status, pr: result.pr });
  }
  return records;
}
