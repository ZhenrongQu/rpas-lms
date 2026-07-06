import "../eval/loadEnv";
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { ensureImage } from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import { GitSentryRepo } from "../../src/lib/agents/remediation/sentry/sentryRepo";
import { classifySentryIssue } from "../../src/lib/agents/remediation/sentry/triage";
import { synthesize } from "../../src/lib/agents/remediation/sentry/synthesizer";
import { buildSentryFixture } from "../../src/lib/agents/remediation/sentry/sentryFixture";
import { runSentryRemediation, SentryDefectSource, type SentryRunDeps } from "../../src/lib/agents/remediation/sentry/runSentryRemediation";
import { runRemediation } from "../../src/lib/agents/remediation/ci/runRemediation";
import { DraftPublisher } from "../../src/lib/agents/remediation/ci/githubDraft";
import type { GitHubClient, OpenPr } from "../../src/lib/agents/remediation/ci/githubClient";
import type { SentryIssue, SentrySource } from "../../src/lib/agents/remediation/sentry/sentryIssue";
import type { MessageCreator } from "../../src/lib/agents/runtime";
import Anthropic from "@anthropic-ai/sdk";

const REPO = process.cwd();

function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`sentry-repair-eval refuses a non-local DB (host: ${host})`);
}

function dryRunGitHub(): GitHubClient {
  return {
    findOpenPr: async () => null,
    pushFixBranch: async (a) => console.log(`[dry-run] would push ${a.headBranch} (patch ${a.patch.length} bytes)`),
    openDraftPr: async (a): Promise<OpenPr> => { console.log(`[dry-run] would open DRAFT PR base ${a.target.baseRef} labels [${a.labels.join(", ")}]`); return { number: 0, url: "(dry-run)" }; },
    commentOnPr: async () => {},
  };
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("sentry-repair-eval needs ANTHROPIC_API_KEY");
  const cur = process.env.RELEASE_CURRENT, prev = process.env.RELEASE_PREVIOUS;
  if (!cur || !prev) throw new Error("set RELEASE_CURRENT + RELEASE_PREVIOUS to the defective/known-good commit SHAs");

  const image = await ensureImage(REPO);
  const repo = new GitSentryRepo(REPO);
  const client = new Anthropic();
  const createMessage: MessageCreator = (p, o) => client.messages.create(p, o);

  const raw = readFileSync("scripts/agents/fixtures/sentry-issues.json", "utf8").replace("RELEASE_CURRENT", cur).replace("RELEASE_PREVIOUS", prev);
  const source: SentrySource = { unresolvedIssues: async () => JSON.parse(raw) as SentryIssue[] };
  const publisher = new DraftPublisher(dryRunGitHub());

  const deps: SentryRunDeps = {
    classify: (issue) => classifySentryIssue(issue, repo),
    synthesize: async (issue, t) => {
      const fileSource = (await repo.readFileAt(t.defectiveCommit, t.sourceRelPath)) ?? "";
      return synthesize({ sourceRelPath: t.sourceRelPath, fnName: t.fnName, fileSource }, issue, createMessage);
    },
    remediate: async (issue, t, synth) => {
      const fixture = await buildSentryFixture(
        { repoRoot: REPO, sourceRelPath: t.sourceRelPath, fnName: t.fnName, knownGoodCommit: t.knownGoodCommit, defectiveCommit: t.defectiveCommit, errorType: issue.error.type, fingerprint: `${issue.error.type}:${t.sourceRelPath}:${t.fnName}`, synthesized: synth, image },
        repo,
      );
      const defectSource = new SentryDefectSource({ repository: process.env.GITHUB_REPOSITORY ?? "local/smoke", defaultBranch: "main", fixture });
      return runRemediation(defectSource, new LlmRepairer(process.env.REAL_REPAIR_MODEL ? { model: process.env.REAL_REPAIR_MODEL } : {}), publisher, { target: { baseRef: prev, headBranch: `remediation/sentry-${t.defectiveCommit.slice(0, 12)}` } });
    },
  };

  const records = await runSentryRemediation(source, deps);
  console.log(JSON.stringify(records, null, 2));
  if (records.some((r) => r.status === "PROPOSED")) process.exitCode = 1; // production must never auto-PROPOSED
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
