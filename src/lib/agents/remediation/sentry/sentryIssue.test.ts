import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixtureSentrySource, SentryApiSource, type SentryIssue } from "./sentryIssue";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

const issue: SentryIssue = {
  id: "1", title: "TypeError", culprit: "grade.ts", count: 3, firstSeen: "", lastSeen: "",
  error: { type: "TypeError", value: "Cannot read properties of undefined (reading 'length')" },
  frames: [{ function: "isAnswerCorrect", filename: "src/lib/exam/grade.ts", lineno: 17, inApp: true }],
  release: { current: "cur", previous: "prev" },
};

describe("FixtureSentrySource", () => {
  it("reads issues from a fixture JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sentry-")); created.push(dir);
    const p = join(dir, "issues.json");
    await writeFile(p, JSON.stringify([issue]));
    expect(await new FixtureSentrySource(p).unresolvedIssues()).toEqual([issue]);
  });

  it("SentryApiSource is a stub that refuses (deferred to a later slice)", async () => {
    await expect(new SentryApiSource().unresolvedIssues()).rejects.toThrow(/event:read/);
  });
});
