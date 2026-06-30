import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { CODEGRAPH_TOOL, runCodegraph } from "../sdlc/tools";

/**
 * The fix agent's tools. Unlike triage (read-only), this agent gets a WRITE tool
 * — so the hard boundary matters: write_file is path-guarded to the worktree, the
 * model physically cannot edit files outside the isolated copy. The whole fix
 * runs in a throwaway git worktree and is captured as a diff for human review;
 * nothing is committed/pushed/merged here.
 */

export const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_file",
  description: "Read a source file from the working copy. Repo-relative path, e.g. 'src/lib/exam/score.ts'.",
  input_schema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
};

export const WRITE_FILE_TOOL: Anthropic.Tool = {
  name: "write_file",
  description:
    "Overwrite a source file with its COMPLETE new contents (not a diff). Repo-relative path only. " +
    "Keep changes minimal and match surrounding style.",
  input_schema: {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  },
};

export const FIX_TOOLS: Anthropic.Tool[] = [READ_FILE_TOOL, WRITE_FILE_TOOL, CODEGRAPH_TOOL];

/** Resolve a repo-relative path inside `root`, rejecting any escape (the hard boundary). */
function safeResolve(root: string, p: string): string {
  if (isAbsolute(p)) throw new Error("path must be repo-relative");
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("path escapes the worktree");
  return abs;
}

/** Builds a runTool bound to one worktree directory. */
export function makeFixRunTool(root: string) {
  return async (name: string, input: unknown): Promise<string> => {
    try {
      if (name === "read_file") {
        const { path } = input as { path: string };
        return readFileSync(safeResolve(root, path), "utf8");
      }
      if (name === "write_file") {
        const { path, content } = input as { path: string; content: string };
        const abs = safeResolve(root, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
        return `wrote ${path} (${content.length} bytes)`;
      }
      if (name === "find_in_codebase") {
        return runCodegraph((input as { query?: string }).query ?? "");
      }
      return `unknown tool: ${name}`;
    } catch (e) {
      return `tool error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
