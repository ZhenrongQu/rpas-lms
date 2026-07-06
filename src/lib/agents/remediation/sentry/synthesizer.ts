// src/lib/agents/remediation/sentry/synthesizer.ts
import { basename, dirname, join } from "node:path";
import type { MessageCreator } from "../../runtime";
import { validateCallExpression } from "./callExpr";
import type { SentryIssue } from "./sentryIssue";

export type SynthTarget = { sourceRelPath: string; fnName: string; fileSource: string };
export type SynthesizedTest = { relPath: string; source: string; testName: string };

const MODEL = "claude-sonnet-4-6";

function prompt(target: SynthTarget, issue: SentryIssue): string {
  return [
    `A production error was reported by Sentry:`,
    `  error type:  ${issue.error.type}`,
    `  error value: ${issue.error.value}`,
    `  function:    ${target.fnName}  (in ${target.sourceRelPath})`,
    ``,
    `Source of the file:`,
    "```ts",
    target.fileSource,
    "```",
    ``,
    `Output EXACTLY ONE JavaScript call expression that invokes ${target.fnName} with literal`,
    `arguments (string/number/boolean/null literals, arrays, and object literals ONLY) chosen`,
    `so the call reproduces the ${issue.error.type}. No imports, no variables, no other code,`,
    `no explanation — just the single call, e.g.  ${target.fnName}({ ... }, [ ... ])`,
  ].join("\n");
}

/**
 * Synthesize a reproducing test. The LLM produces ONLY the call expression; the host validates
 * it (single literal call of fnName) and assembles the file — import, test name, and a BARE
 * call (no assertion) so the defect throws its original error type. Returns null when the
 * model output is unusable (→ synthesis-failed).
 */
export async function synthesize(target: SynthTarget, issue: SentryIssue, createMessage: MessageCreator): Promise<SynthesizedTest | null> {
  let text: string;
  try {
    const msg = await createMessage({ model: MODEL, max_tokens: 512, messages: [{ role: "user", content: prompt(target, issue) }] });
    const block = msg.content.find((b) => b.type === "text");
    text = block && block.type === "text" ? block.text : "";
  } catch {
    return null;
  }
  const call = validateCallExpression(text, target.fnName);
  if (!call) return null;

  const dir = dirname(target.sourceRelPath);
  const importName = basename(target.sourceRelPath).replace(/\.[cm]?[jt]sx?$/, "");
  const relPath = join(dir, "__sentry_repro__.test.ts");
  const testName = `sentry repro: ${issue.error.type} in ${target.fnName}`;
  const source =
    `import { it } from "vitest";\n` +
    `import { ${target.fnName} } from "./${importName}";\n\n` +
    `it(${JSON.stringify(testName)}, () => {\n  ${call};\n});\n`;
  return { relPath, source, testName };
}
