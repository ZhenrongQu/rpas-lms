import { describe, expect, it } from "vitest";
import { matchSignature, nodeStackStrategy, parseFailureSignature } from "./signature";

const TYPE_ERROR_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'score')",
  "    at score (file:///tmp/wt/src/score.mjs:2:22)",
  "    at file:///tmp/wt/src/check.mjs:2:13",
  "    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)",
].join("\n");

const incident = { errorType: "TypeError", sourceFile: "src/score.mjs", symbol: "score" };

describe("parseFailureSignature", () => {
  it("extracts the error type and application frames (skipping node internals)", () => {
    const sig = parseFailureSignature(TYPE_ERROR_STACK);
    expect(sig).not.toBeNull();
    expect(sig!.errorType).toBe("TypeError");
    expect(sig!.applicationFrames[0]).toEqual({ module: "score.mjs", symbol: "score" });
    expect(sig!.applicationFrames.some((f) => f.module.startsWith("node:"))).toBe(false);
  });

  it("returns null when there is no error line", () => {
    expect(parseFailureSignature("just some log output\nnothing to see")).toBeNull();
  });
});

describe("matchSignature", () => {
  const observed = parseFailureSignature(TYPE_ERROR_STACK)!;

  it("matches on same error type, file and symbol", () => {
    expect(matchSignature(observed, incident)).toBe("match");
  });

  it("mismatches on a different error type", () => {
    expect(matchSignature(observed, { ...incident, errorType: "RangeError" })).toBe("mismatch");
  });

  it("mismatches on a different symbol in the same file", () => {
    expect(matchSignature(observed, { ...incident, symbol: "somethingElse" })).toBe("mismatch");
  });

  it("is low-confidence when a symbol is missing on one side", () => {
    expect(matchSignature(observed, { errorType: "TypeError", sourceFile: "src/score.mjs" })).toBe("low-confidence");
  });

  it("mismatches when there is no application frame", () => {
    expect(matchSignature({ errorType: "TypeError", applicationFrames: [] }, incident)).toBe("mismatch");
  });
});

describe("nodeStackStrategy", () => {
  const strat = nodeStackStrategy(incident);

  it("parses + matches a red check's stderr against the baked-in incident", () => {
    const observed = strat.parse({ exitCode: 1, stdout: "", stderr: TYPE_ERROR_STACK })!;
    expect(observed.errorType).toBe("TypeError");
    expect(strat.match(observed)).toBe("match");
  });

  it("returns null on a green/unrecognizable check and serializes deterministically", () => {
    expect(strat.parse({ exitCode: 0, stdout: "", stderr: "" })).toBeNull();
    const observed = strat.parse({ exitCode: 1, stdout: "", stderr: TYPE_ERROR_STACK })!;
    expect(strat.serialize(observed)).toBe(strat.serialize(observed)); // stable for stability comparison
  });
});
