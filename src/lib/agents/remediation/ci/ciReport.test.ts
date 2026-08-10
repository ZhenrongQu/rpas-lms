import { describe, expect, it } from "vitest";
import { parseCiReport } from "./ciReport";

const report = JSON.stringify({
  success: false,
  testResults: [
    {
      name: "/repo/src/lib/exam/grade.test.ts",
      assertionResults: [
        { fullName: "isAnswerCorrect ignores duplicate selections", title: "ignores duplicate selections", status: "failed", failureMessages: ["AssertionError: expected false to be true"] },
        { fullName: "other passing", title: "other passing", status: "passed", failureMessages: [] },
      ],
    },
  ],
});

describe("parseCiReport", () => {
  it("extracts the first failing test's signature + its file as a related test", () => {
    const f = parseCiReport(report);
    expect(f).toEqual({
      signature: { testFile: "src/lib/exam/grade.test.ts", testName: "ignores duplicate selections", errorName: "AssertionError" },
      relatedTests: ["src/lib/exam/grade.test.ts"],
    });
  });

  it("returns null when no test failed or the JSON is unparseable", () => {
    expect(parseCiReport('{"success":true,"testResults":[]}')).toBeNull();
    expect(parseCiReport("not json")).toBeNull();
  });
});
