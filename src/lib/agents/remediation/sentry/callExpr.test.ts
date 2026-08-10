import { describe, expect, it } from "vitest";
import { validateCallExpression } from "./callExpr";

describe("validateCallExpression", () => {
  it("accepts a single call of fnName with literal / array / object args", () => {
    expect(validateCallExpression(`isAnswerCorrect({ id: "a", n: -1, ok: true }, ["a", "a"]);`, "isAnswerCorrect"))
      .toBe(`isAnswerCorrect({ id: "a", n: -1, ok: true }, ["a", "a"])`);
  });
  it("strips a trailing semicolon and surrounding markdown fence", () => {
    expect(validateCallExpression("```ts\nf(1)\n```", "f")).toBe("f(1)");
  });
  it("rejects a wrong callee", () => {
    expect(validateCallExpression("other(1)", "f")).toBeNull();
  });
  it("rejects a non-literal argument (identifier / nested call / member access)", () => {
    expect(validateCallExpression("f(x)", "f")).toBeNull();
    expect(validateCallExpression("f(g(1))", "f")).toBeNull();
    expect(validateCallExpression("f(a.b)", "f")).toBeNull();
  });
  it("rejects anything that is not a single call expression", () => {
    expect(validateCallExpression("f(1); f(2)", "f")).toBeNull();
    expect(validateCallExpression("const x = f(1)", "f")).toBeNull();
    expect(validateCallExpression("not code {{", "f")).toBeNull();
  });
  it("rejects object properties that are not plain literal key:value pairs", () => {
    expect(validateCallExpression("f({ [x]: 1 })", "f")).toBeNull();   // computed key (identifier ref)
    expect(validateCallExpression("f({ x })", "f")).toBeNull();         // shorthand
    expect(validateCallExpression("f({ ...o })", "f")).toBeNull();      // spread
  });
});
