// src/lib/agents/remediation/sentry/synthesizer.test.ts
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { synthesize, type SynthTarget } from "./synthesizer";
import type { MessageCreator } from "../../runtime";
import type { SentryIssue } from "./sentryIssue";

const target: SynthTarget = { sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect", fileSource: "export function isAnswerCorrect(q, s) { return q.options.length === s.length; }" };
const issue = { error: { type: "TypeError", value: "Cannot read properties of undefined (reading 'length')" } } as SentryIssue;

const reply = (text: string): MessageCreator => async () => ({ content: [{ type: "text", text }] } as unknown as Anthropic.Message);

describe("synthesize", () => {
  it("host-assembles a bare-call test from a valid model call expression", async () => {
    const out = await synthesize(target, issue, reply(`isAnswerCorrect({ options: [] }, ["a"])`));
    expect(out).not.toBeNull();
    expect(out!.relPath).toBe("src/lib/exam/__sentry_repro__.test.ts");
    expect(out!.source).toContain(`import { isAnswerCorrect } from "./grade"`);
    expect(out!.source).toContain(`isAnswerCorrect({ options: [] }, ["a"]);`);
    expect(out!.source).not.toContain("toThrow"); // bare call, no assertion
  });

  it("returns null when the model output fails the call-expression rule", async () => {
    expect(await synthesize(target, issue, reply("isAnswerCorrect(someVar)"))).toBeNull();
  });
});
