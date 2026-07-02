import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createRegressionFixture, type RegressionFixture } from "../fixtures";
import { makeRepairContext } from "../repair";
import type { MessageCreator } from "../../runtime";
import { LlmRepairer } from "./repairer";

// Hermetic: the model is scripted via createMessage; the TOOLS run for real against
// a throwaway fixture worktree, so we exercise the true capability sandbox.
const POLICY = { allowedPaths: ["src/score.mjs"], pinnedPaths: ["src/check.mjs"], readAllowlist: ["src/"] };
const created: RegressionFixture[] = [];
afterEach(async () => Promise.all(created.splice(0).map((f) => f.cleanup())).then(() => undefined));

const textBlock = (text: string) => ({ type: "text", text, citations: null });
const toolBlock = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const msg = (content: unknown[], stop: string): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "mock", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;

function scripted(responses: Anthropic.Message[]): MessageCreator {
  let i = 0;
  return async () => responses[Math.min(i++, responses.length - 1)]!;
}

async function newFixture(): Promise<RegressionFixture> {
  const f = await createRegressionFixture();
  created.push(f);
  return f;
}

describe("LlmRepairer", () => {
  it("fixes the defect: read → write correct source → run_check PASS → stop", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const repairer = new LlmRepairer({
      createMessage: scripted([
        msg([toolBlock("t1", "read_file", { path: "src/score.mjs" })], "tool_use"),
        msg([toolBlock("t2", "write_file", { path: "src/score.mjs", content: fixture.fixedSource })], "tool_use"),
        msg([toolBlock("t3", "run_check", {})], "tool_use"),
        msg([textBlock("Guarded the missing element.")], "end_turn"),
      ]),
    });

    await repairer.repair(ctx);

    expect((await ctx.runCheck()).exitCode).toBe(0); // the fix landed
    expect(repairer.steps).toHaveLength(4); // trace captured
    expect(repairer.steps[1]!.toolCalls[0]!.name).toBe("write_file");
  });

  it("the sandbox blocks a write to the pinned check (cheat), and the run does not crash", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const original = await ctx.readFile("src/check.mjs");
    const repairer = new LlmRepairer({
      createMessage: scripted([
        msg([toolBlock("t1", "write_file", { path: "src/check.mjs", content: "process.exit(0)" })], "tool_use"),
        msg([textBlock("Could not proceed.")], "end_turn"),
      ]),
    });

    await repairer.repair(ctx);
    expect(await ctx.readFile("src/check.mjs")).toBe(original); // pinned check untouched
  });

  it("rejects a non-string tool input instead of coercing it (no [object Object] written)", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const repairer = new LlmRepairer({
      createMessage: scripted([
        msg([toolBlock("t1", "write_file", { path: "src/score.mjs", content: { not: "a string" } })], "tool_use"),
        msg([textBlock("stopping")], "end_turn"),
      ]),
    });
    await repairer.repair(ctx);
    expect(await ctx.readFile("src/score.mjs")).not.toContain("[object Object]"); // original source intact
  });

  it("gives up quietly when the budget is exhausted (no convergence)", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const repairer = new LlmRepairer({
      maxSteps: 2,
      createMessage: scripted([msg([toolBlock("t", "run_check", {})], "tool_use")]), // never stops
    });

    await repairer.repair(ctx); // no throw
    expect((await ctx.runCheck()).exitCode).toBe(1); // defect still there → kernel routes to NEEDS_HUMAN
  });

  it("returns a redacted, persist-safe trace (byte-count + hash, no raw content)", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const repairer = new LlmRepairer({
      createMessage: scripted([
        msg([textBlock("Reading the source."), toolBlock("t1", "read_file", { path: "src/score.mjs" })], "tool_use"),
        msg([toolBlock("t2", "write_file", { path: "src/score.mjs", content: fixture.fixedSource })], "tool_use"),
        msg([textBlock("done")], "end_turn"),
      ]),
    });
    const report = await repairer.repair(ctx);
    const writeTool = report.trace.flatMap((s) => s.tools).find((t) => t.name === "write_file")!;
    expect(writeTool.path).toBe("src/score.mjs");
    expect(writeTool.contentBytes).toBeGreaterThan(0);
    expect(writeTool.contentSha256).toMatch(/^[0-9a-f]{16}$/);
    expect(writeTool).not.toHaveProperty("content"); // raw source is NOT in the trace
    expect(report.trace[0]!.reasoning).toContain("Reading"); // reasoning summary kept
  });

  it("byte-bounds the persisted trace (multibyte reasoning, long path, many tools)", async () => {
    const fixture = await newFixture();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, new AbortController().signal);
    const bigReasoning = "字".repeat(1000); // 3000 UTF-8 bytes of 3-byte codepoints
    const longPath = "src/" + "a".repeat(1000) + ".mjs";
    const manyTools = Array.from({ length: 50 }, (_, i) => toolBlock(`r${i}`, "read_file", { path: `src/f${i}.mjs` }));
    const repairer = new LlmRepairer({
      createMessage: scripted([
        msg([textBlock(bigReasoning), toolBlock("w", "write_file", { path: longPath, content: "x" }), ...manyTools], "tool_use"),
        msg([textBlock("done")], "end_turn"),
      ]),
    });
    const report = await repairer.repair(ctx);
    const step0 = report.trace[0]!;
    expect(Buffer.byteLength(step0.reasoning)).toBeLessThanOrEqual(500); // true UTF-8 byte cap, no split codepoint
    expect(step0.reasoning.endsWith("�")).toBe(false); // no dangling replacement char
    expect(step0.tools.length).toBeLessThanOrEqual(16); // per-step tool count capped
    expect(Buffer.byteLength(step0.tools[0]!.path!)).toBeLessThanOrEqual(256); // path byte-capped
  });

  it("propagates an abort (lease lost)", async () => {
    const fixture = await newFixture();
    const ctrl = new AbortController();
    ctrl.abort();
    const ctx = makeRepairContext(fixture.repoRoot, POLICY, ctrl.signal);
    const repairer = new LlmRepairer({ createMessage: scripted([msg([textBlock("x")], "end_turn")]) });
    await expect(repairer.repair(ctx)).rejects.toThrow(/abort/i);
  });
});
