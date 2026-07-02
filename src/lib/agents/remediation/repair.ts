import { readFile as fsReadFile, writeFile as fsWriteFile, lstat, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { scriptCheckRunner, type CheckResult, type CheckRunner } from "./substrate";

const DEFAULT_MAX_READ_BYTES = 64 * 1024;
const DEFAULT_CHECK = "src/check.mjs";

/**
 * A repairer never receives a raw worktree path — only a capability that enforces
 * the policy, so a (future LLM) repairer literally cannot touch the pinned
 * reproduction, `.git`, secrets, or anything outside the worktree. Reads are
 * allowlist-gated (NOT default whole-repo read); the hash check in the fix attempt
 * stays as defense-in-depth.
 */
export type RepairPolicy = {
  allowedPaths: string[];
  pinnedPaths: string[];
  /** Path prefixes the repairer may read/list (e.g. ["src/"]); reads outside are denied. */
  readAllowlist: string[];
  /** Reject reads larger than this many bytes (default 64KB). */
  maxReadBytes?: number;
};

export type RepairContext = {
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, content: string): Promise<void>;
  listFiles(): Promise<string[]>;
  runCheck(): Promise<CheckResult>;
  signal: AbortSignal;
};

/** A bounded, REDACTED step of the author's trace — safe to persist into the
 *  proposal. Never the raw file content or full model text: only a byte-count +
 *  short hash of any written content, and a truncated reasoning summary. Each tool
 *  carries its ACTUAL disposition so the trace can't over-report what ran. */
export type RepairToolStatus = "executed" | "denied" | "skipped_budget";
export type RepairTraceStep = {
  step: number;
  tokens: number;
  reasoning: string;
  tools: { name: string; status: RepairToolStatus; path?: string; contentBytes?: number; contentSha256?: string }[];
};

export type RepairReport = { trace: RepairTraceStep[]; tokens: number };

export interface Repairer {
  /** Returns a redacted report (LLM author) or void (deterministic oracle). */
  repair(ctx: RepairContext): Promise<RepairReport | void>;
}

// Never readable, even inside the worktree — VCS internals, env/secrets, deps.
const DENY_READ: RegExp[] = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.env(\.[^/]*)?$/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa|\.npmrc|\.netrc)(\/|$)/,
  /\.(pem|key|p12|pfx|crt)$/i,
];
const isDeniedRead = (norm: string): boolean => DENY_READ.some((re) => re.test(norm));
const inReadAllowlist = (norm: string, allow: string[]): boolean =>
  allow.some((p) => norm === p || norm.startsWith(p.endsWith("/") ? p : `${p}/`));

async function guard(worktreeRoot: string, rel: string, policy: RepairPolicy, forWrite: boolean): Promise<string> {
  const resolved = resolve(worktreeRoot, rel);
  const relToRoot = relative(worktreeRoot, resolved);
  // Prefix-safe containment (path.relative, not startsWith): must stay inside.
  if (!relToRoot || relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    throw new Error(`path escapes the worktree: ${rel}`);
  }
  const norm = relToRoot.split(sep).join("/");
  if (forWrite) {
    if (policy.pinnedPaths.includes(norm)) throw new Error(`path is pinned (read-only): ${rel}`);
    if (!policy.allowedPaths.includes(norm)) throw new Error(`path not allowed for write: ${rel}`);
  } else {
    // Reads are allowlist-gated: the repairer has NO default whole-repo read.
    if (!inReadAllowlist(norm, policy.readAllowlist)) throw new Error(`path not in read allowlist: ${rel}`);
    if (isDeniedRead(norm)) throw new Error(`path is denied for read: ${rel}`);
  }
  // Symlink guard: the real parent directory must still resolve inside the worktree.
  const realRoot = await realpath(worktreeRoot);
  const realParent = await realpath(dirname(resolved)).catch(() => dirname(resolved));
  const relParent = relative(realRoot, realParent);
  if (relParent.startsWith("..") || isAbsolute(relParent)) {
    throw new Error(`path traverses a symlink out of the worktree: ${rel}`);
  }
  // The leaf itself may be a symlink even when its parent is contained; reading or
  // writing it would follow the link out of the worktree. lstat (does not follow)
  // and reject. A missing leaf (new-file write) throws ENOENT — that is fine.
  const leaf = await lstat(resolved).catch(() => null);
  if (leaf?.isSymbolicLink()) throw new Error(`path is a symlink (rejected): ${rel}`);
  return resolved;
}

export function makeRepairContext(
  worktreeRoot: string,
  policy: RepairPolicy,
  signal: AbortSignal,
  checkRunner: CheckRunner = scriptCheckRunner(DEFAULT_CHECK),
): RepairContext {
  const maxReadBytes = policy.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
  return {
    signal,
    async readFile(rel) {
      const p = await guard(worktreeRoot, rel, policy, false);
      const { size } = await stat(p);
      if (size > maxReadBytes) throw new Error(`file too large to read (${size} > ${maxReadBytes}): ${rel}`);
      const buf = await fsReadFile(p);
      if (buf.includes(0)) throw new Error(`refusing to read a binary file: ${rel}`);
      return buf.toString("utf8");
    },
    async writeFile(rel, content) {
      await fsWriteFile(await guard(worktreeRoot, rel, policy, true), content);
    },
    async listFiles() {
      const out: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const abs = join(dir, e.name);
          const norm = relative(worktreeRoot, abs).split(sep).join("/");
          if (isDeniedRead(norm)) continue; // prune .git/, node_modules/, secrets
          if (e.isDirectory()) await walk(abs);
          else if (e.isFile() && inReadAllowlist(norm, policy.readAllowlist)) out.push(norm);
        }
      };
      await walk(worktreeRoot);
      return out.sort();
    },
    // The runner returns a red/green CheckResult and throws only on abort, which
    // propagates (lease loss) exactly as before.
    runCheck: () => checkRunner(worktreeRoot, signal),
  };
}

/** Deterministic repairer: applies a known-correct source to one path. */
export class FixtureRepairer implements Repairer {
  constructor(
    private readonly sourceRelPath: string,
    private readonly fixedSource: string,
  ) {}
  async repair(ctx: RepairContext): Promise<void> {
    await ctx.writeFile(this.sourceRelPath, this.fixedSource);
  }
}

export function fixtureRepairerFor(fixture: { sourceRelPath: string; fixedSource: string }): FixtureRepairer {
  return new FixtureRepairer(fixture.sourceRelPath, fixture.fixedSource);
}

// The model-driven repairer (same interface) lives in ./llm/repairer.ts.
