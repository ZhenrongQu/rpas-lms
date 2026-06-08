import { describe, it, expect } from "vitest";
import { GET as getCheckpoint } from "./[id]/route";
import { POST as checkCheckpoint } from "./check/route";
import { loadQuestionBank } from "../../../src/lib/content/loadBank";
import { correctOptionIds } from "../../../src/lib/exam/grade";

const bank = loadQuestionBank();
const sample = bank.questions.find((q) => q.moduleId === "air-law")!;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("checkpoint API", () => {
  it("GET returns the public question without isCorrect", async () => {
    const res = await getCheckpoint(new Request(`http://test?locale=en`), ctx(sample.id));
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    const body = await res.json();
    expect(body.id).toBe(sample.id);
    expect(Array.isArray(body.options)).toBe(true);
  });

  it("GET 404 for unknown id", async () => {
    const res = await getCheckpoint(new Request("http://test?locale=en"), ctx("nope-9999"));
    expect(res.status).toBe(404);
  });

  it("POST check grades correct vs incorrect and returns explanation", async () => {
    const right = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({
          questionId: sample.id,
          selectedOptionIds: correctOptionIds(sample),
          locale: "en",
        }),
      }),
    );
    const rbody = await right.json();
    expect(right.status).toBe(200);
    expect(rbody.correct).toBe(true);
    expect(rbody.explanation.length).toBeGreaterThan(0);

    const wrong = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: sample.id, selectedOptionIds: ["__no__"], locale: "en" }),
      }),
    );
    const wbody = await wrong.json();
    expect(wbody.correct).toBe(false);
    expect(Array.isArray(wbody.correctOptionIds)).toBe(true);
  });
});
