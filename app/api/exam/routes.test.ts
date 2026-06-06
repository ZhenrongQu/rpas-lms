import { describe, it, expect } from "vitest";
import { POST as createExam } from "./route";
import { GET as getQuestions } from "./[id]/questions/route";
import { POST as postAnswer } from "./[id]/answer/route";
import { POST as postSubmit } from "./[id]/submit/route";
import { GET as getReview } from "./[id]/review/route";

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("exam API route handlers", () => {
  it("POST /api/exam creates a Basic session", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 42 }),
      }),
    );
    const { status, body } = await json(res);
    expect(status).toBe(201);
    expect(body.total).toBe(35);
    expect(typeof body.sessionId).toBe("string");
  });

  it("400 on invalid create payload", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "PRO", locale: "EN" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("runs the full create → questions → answer → submit flow", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 7 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const qRes = await getQuestions(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    const questions = (await qRes.json()) as { id: string }[];
    expect(questions.length).toBe(35);
    expect(JSON.stringify(questions)).not.toContain("isCorrect");

    const ansRes = await postAnswer(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: questions[0].id, selectedOptionIds: ["a"] }),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(ansRes.status).toBe(200);

    const subRes = await postSubmit(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: sessionId }),
    });
    const result = (await subRes.json()) as { total: number; passed: boolean };
    expect(result.total).toBe(35);
    expect(typeof result.passed).toBe("boolean");
  });

  it("404 when questions requested for an unknown session", async () => {
    const res = await getQuestions(new Request("http://test"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("review is 404 before submit and 200 after submit", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 11 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const before = await getReview(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(before.status).toBe(404);

    await postSubmit(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: sessionId }),
    });

    const after = await getReview(new Request("http://test"), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(after.status).toBe(200);
    const items = (await after.json()) as unknown[];
    expect(items.length).toBe(35);
  });
});
