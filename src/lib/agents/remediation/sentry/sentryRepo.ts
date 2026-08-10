import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Read-only git queries the Sentry triage/synthesis needs, injectable for hermetic tests. */
export interface SentryRepo {
  commitExists(sha: string): Promise<boolean>;
  isAncestor(a: string, b: string): Promise<boolean>;
  /** Non-test source files under src/ changed in a..b. */
  changedSourceFiles(a: string, b: string): Promise<string[]>;
  fileExistsAt(commit: string, relPath: string): Promise<boolean>;
  readFileAt(commit: string, relPath: string): Promise<string | null>;
  hasNamedExport(commit: string, relPath: string, fnName: string): Promise<boolean>;
}

const isTest = (f: string) => /\.test\.[cm]?[jt]sx?$/.test(f);

export class GitSentryRepo implements SentryRepo {
  constructor(private readonly repoRoot: string) {}
  private git(args: string[]) {
    return run("git", args, { cwd: this.repoRoot, maxBuffer: 16 * 1024 * 1024 });
  }
  async commitExists(sha: string): Promise<boolean> {
    return this.git(["cat-file", "-e", `${sha}^{commit}`]).then(() => true).catch(() => false);
  }
  async isAncestor(a: string, b: string): Promise<boolean> {
    return this.git(["merge-base", "--is-ancestor", a, b]).then(() => true).catch(() => false);
  }
  async changedSourceFiles(a: string, b: string): Promise<string[]> {
    const out = (await this.git(["diff", "--name-only", a, b])).stdout.trim();
    return (out ? out.split("\n") : []).filter((f) => f.startsWith("src/") && !isTest(f));
  }
  async fileExistsAt(commit: string, relPath: string): Promise<boolean> {
    return this.git(["cat-file", "-e", `${commit}:${relPath}`]).then(() => true).catch(() => false);
  }
  async readFileAt(commit: string, relPath: string): Promise<string | null> {
    return this.git(["show", `${commit}:${relPath}`]).then((r) => r.stdout).catch(() => null);
  }
  async hasNamedExport(commit: string, relPath: string, fnName: string): Promise<boolean> {
    const src = await this.readFileAt(commit, relPath);
    if (!src) return false;
    // Best-effort: `export function fn`, `export const fn`, `export … class fn`, or `export { fn }`.
    const decl = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${fnName}\\b`);
    const named = new RegExp(`export\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}`);
    return decl.test(src) || named.test(src);
  }
}
