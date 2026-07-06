import "../eval/loadEnv";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { prisma } from "../../src/lib/db";
import { ensureImage } from "../../src/lib/agents/remediation/isolated/dockerCheckRunner";
import { LlmRepairer } from "../../src/lib/agents/remediation/llm/repairer";
import { CiDefectSource } from "../../src/lib/agents/remediation/ci/ciDefectSource";
import { DraftPublisher } from "../../src/lib/agents/remediation/ci/githubDraft";
import { runRemediation } from "../../src/lib/agents/remediation/ci/runRemediation";
import type { CiEvent, CiHistory, GitOps } from "../../src/lib/agents/remediation/ci/baseline";
import type { ChangedFiles, RepoInspector } from "../../src/lib/agents/remediation/ci/commitPairFixture";
import type { GitHubClient, OpenPr, PrTarget } from "../../src/lib/agents/remediation/ci/githubClient";

const run = promisify(execFile);
const REPO = process.cwd();

function assertLocalDb(): void {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`remediation-ci refuses a non-local DB (host: ${host})`);
}

const git: GitOps = { mergeBase: async (a, b) => (await run("git", ["merge-base", a, b], { cwd: REPO })).stdout.trim() };

const history: CiHistory = {
  // Last commit on `branch` whose test.yml run concluded success.
  lastGreenCommit: async (branch, _beforeSha) => {
    const out = (
      await run("gh", ["run", "list", "--workflow", "test.yml", "--branch", branch, "--status", "success", "--limit", "1", "--json", "headSha"], { cwd: REPO }).catch(() => ({ stdout: "[]" }))
    ).stdout;
    const rows = JSON.parse(out) as Array<{ headSha: string }>;
    return rows[0]?.headSha ?? null;
  },
};

const repo: RepoInspector = {
  changedFiles: async (a, b): Promise<ChangedFiles> => {
    const out = (await run("git", ["diff", "--name-only", a, b], { cwd: REPO })).stdout.trim();
    const files = out ? out.split("\n") : [];
    const isTest = (f: string) => /\.test\.[cm]?[jt]sx?$/.test(f);
    return { sourceFiles: files.filter((f) => f.startsWith("src/") && !isTest(f)), testFiles: files.filter(isTest) };
  },
  relatedTestFiles: async (sourceRelPath, excluding) => {
    const mod = sourceRelPath.replace(/^src\//, "").replace(/\.[cm]?[jt]sx?$/, "");
    const out = (await run("git", ["grep", "-l", mod, "--", "src/**/*.test.ts"], { cwd: REPO }).catch(() => ({ stdout: "" }))).stdout.trim();
    return (out ? out.split("\n") : []).filter((f) => !excluding.includes(f));
  },
};

const gh: GitHubClient = {
  findOpenPr: async (headBranch): Promise<OpenPr | null> => {
    const out = (
      await run("gh", ["pr", "list", "--head", headBranch, "--state", "open", "--json", "number,url", "--limit", "1"], { cwd: REPO }).catch(() => ({ stdout: "[]" }))
    ).stdout;
    const rows = JSON.parse(out) as OpenPr[];
    return rows[0] ?? null;
  },
  pushFixBranch: async ({ headBranch, baseCommit, patch, message }) => {
    await run("git", ["checkout", "-B", headBranch, baseCommit], { cwd: REPO });
    const patchFile = join(tmpdir(), `remediation-${Date.now()}.patch`);
    await writeFile(patchFile, patch);
    try {
      await run("git", ["apply", patchFile], { cwd: REPO });
    } finally {
      await rm(patchFile, { force: true }).catch(() => {});
    }
    await run("git", ["commit", "-aqm", message], { cwd: REPO });
    await run("git", ["push", "-f", "origin", headBranch], { cwd: REPO });
  },
  openDraftPr: async ({ target, title, body, labels }): Promise<OpenPr> => {
    const out = (
      await run("gh", ["pr", "create", "--draft", "--base", target.baseRef.replace(/^origin\//, ""), "--head", target.headBranch, "--title", title, "--body", body, "--label", labels.join(",")], { cwd: REPO })
    ).stdout.trim();
    const number = Number(out.match(/\/pull\/(\d+)/)?.[1] ?? 0);
    return { number, url: out };
  },
  commentOnPr: async (n, body) => {
    await run("gh", ["pr", "comment", String(n), "--body", body], { cwd: REPO });
  },
};

/** Build the CiEvent from env vars the workflow sets from the triggering workflow_run. */
function readEvent(): CiEvent {
  const headSha = process.env.CI_HEAD_SHA ?? "";
  if (process.env.CI_EVENT_KIND === "pull_request") {
    return { kind: "pull_request", headSha, baseRef: `origin/${process.env.CI_BASE_REF || "main"}` };
  }
  return { kind: "push", branch: process.env.CI_HEAD_BRANCH || "main", headSha };
}

async function main(): Promise<void> {
  assertLocalDb();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("remediation-ci needs ANTHROPIC_API_KEY");
  const image = await ensureImage(REPO);
  const event = readEvent();
  const source = new CiDefectSource({
    reportJson: readFileSync(process.env.CI_REPORT_FILE ?? "vitest-report.json", "utf8"),
    event,
    originRepo: REPO,
    repository: process.env.GITHUB_REPOSITORY ?? "unknown/unknown",
    defaultBranch: "main",
    image,
    git,
    history,
    repo,
  });
  const baseRef = event.kind === "pull_request" ? event.baseRef : "origin/main";
  const target: PrTarget = { baseRef, headBranch: `remediation/${event.headSha.slice(0, 12)}` };
  const repairer = new LlmRepairer(process.env.REAL_REPAIR_MODEL ? { model: process.env.REAL_REPAIR_MODEL } : {});
  const result = await runRemediation(source, repairer, new DraftPublisher(gh), { target });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "PROPOSED") process.exitCode = 1; // production must never auto-PROPOSED
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
