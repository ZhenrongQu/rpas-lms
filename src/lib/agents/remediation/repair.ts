import { readFile as fsReadFile, writeFile as fsWriteFile, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * A repairer never receives a raw worktree path — only a capability that enforces
 * the write policy, so a (future LLM) repairer literally cannot touch the pinned
 * reproduction, `.git`, or anything outside the worktree. The hash check in the
 * fix attempt stays as defense-in-depth.
 */
export type RepairPolicy = { allowedPaths: string[]; pinnedPaths: string[] };

export type RepairContext = {
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, content: string): Promise<void>;
  signal: AbortSignal;
};

export interface Repairer {
  repair(ctx: RepairContext): Promise<void>;
}

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

export function makeRepairContext(worktreeRoot: string, policy: RepairPolicy, signal: AbortSignal): RepairContext {
  return {
    signal,
    async readFile(rel) {
      return fsReadFile(await guard(worktreeRoot, rel, policy, false), "utf8");
    },
    async writeFile(rel, content) {
      await fsWriteFile(await guard(worktreeRoot, rel, policy, true), content);
    },
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

/** Same-interface stub — the model-driven repairer is a later milestone. */
export class LlmRepairer implements Repairer {
  async repair(): Promise<void> {
    throw new Error("LlmRepairer not implemented — deferred to a later milestone");
  }
}
