import type Anthropic from "@anthropic-ai/sdk";

/**
 * The repair agent's soft layer. The HARD guarantees live in the capability
 * sandbox (repair.ts) and the deterministic verify/holdout gates — this prompt
 * only steers behaviour; it cannot grant the model anything the sandbox denies.
 */
export const REPAIR_SYSTEM_PROMPT = `You are an automated code-repair agent. A reproduction test in this repository is currently failing. Your job is to make the SMALLEST change to the source that makes the test pass.

Method:
- Investigate first: use list_files and read_file to understand the code and why the test fails.
- Edit source with write_file, then call run_check to see if it passes. Iterate.
- When run_check returns PASS, stop and briefly state what you changed.

Hard rules:
- Fix the ROOT CAUSE. Do NOT hardcode the expected output, special-case the test's input, or otherwise game the check — a hidden test will reject such fixes.
- The reproduction test is read-only. Never weaken, delete, or rewrite it.
- Only edit files inside the allowed source paths. Reads are limited too; a denied tool call returns an error — adapt, do not retry the same thing.
- If you cannot find a correct fix, say so and stop rather than guessing.`;

export const REPAIR_TASK =
  "A reproduction test is failing in this repository. Investigate with your tools and fix the source so run_check returns PASS.";

export const REPAIR_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_files",
    description: "List the source files you are allowed to read.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read a source file's contents.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "repo-relative path, e.g. src/score.mjs" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Overwrite a source file with new contents.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "run_check",
    description: "Run the reproduction test. Returns PASS, or FAIL with the exit code and stderr.",
    input_schema: { type: "object", properties: {} },
  },
];
