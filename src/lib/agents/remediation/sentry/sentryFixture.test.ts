import { describe, expect, it } from "vitest";
import { buildSentryFixture, type SentryFixtureSpec } from "./sentryFixture";
import type { SentryRepo } from "./sentryRepo";

const repo = (siblingExists: boolean): SentryRepo => ({
  commitExists: async () => true, isAncestor: async () => true, changedSourceFiles: async () => [],
  fileExistsAt: async (_c, p) => (p.endsWith(".test.ts") ? siblingExists : true),
  readFileAt: async () => "", hasNamedExport: async () => true,
});

const spec: SentryFixtureSpec = {
  repoRoot: "/repo", sourceRelPath: "src/lib/exam/grade.ts", fnName: "isAnswerCorrect",
  knownGoodCommit: "prev", defectiveCommit: "cur", errorType: "TypeError", fingerprint: "TypeError:grade",
  synthesized: { relPath: "src/lib/exam/__sentry_repro__.test.ts", source: "// test", testName: "sentry repro" },
  image: "img:tag",
};

describe("buildSentryFixture", () => {
  it("wires an injecting runCheck, no-op cleanup, and single-file target", async () => {
    const fx = await buildSentryFixture(spec, repo(true));
    expect(fx.knownGoodCommit).toBe("prev");
    expect(fx.defectiveCommit).toBe("cur");
    expect(fx.mainCommit).toBe("cur");
    expect(fx.sourceRelPath).toBe("src/lib/exam/grade.ts");
    expect(fx.verificationProfile).toBe("production-black-box");
    expect(fx.substrate.pinnedPaths).toEqual([]); // re-injection protects, no pinning
    await expect(fx.cleanup()).resolves.toBeUndefined(); // no-op on the real checkout
  });

  it("chooses the placeholder holdout when no sibling test exists (distinct substrate identity)", async () => {
    const withSibling = await buildSentryFixture(spec, repo(true));
    const withoutSibling = await buildSentryFixture(spec, repo(false));
    expect(withoutSibling.substrate.identity).not.toBe(withSibling.substrate.identity);
  });
});
