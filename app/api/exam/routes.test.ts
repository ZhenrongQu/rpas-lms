import { beforeEach, describe, it, expect } from "vitest";
import { prisma } from "../../../src/lib/db";
import { POST as createExam } from "./route";
import { GET as getQuestions } from "./[id]/questions/route";
import { POST as postAnswer } from "./[id]/answer/route";
import { POST as postSubmit } from "./[id]/submit/route";
import { GET as getReview } from "./[id]/review/route";

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("exam API route handlers", () => {
  beforeEach(async () => {
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({
      data: { id: "u1", email: "u1@test.local", hashedPassword: "x", accessTier: "FREE" },
    });
  });

  it("401 when a guest tries to create an exam", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 42 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/exam creates a Basic session", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 42 }),
      }),
    );
    const { status, body } = await json(res);
    expect(status).toBe(201);
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBeLessThan(35);
    expect(typeof body.sessionId).toBe("string");
  });

  it("403 when a free user tries to create an Advanced exam", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "ADVANCED", locale: "EN", seed: 42 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts Chinese locale when creating an exam", async () => {
    const res = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "BASIC", locale: "ZH", seed: 42 }),
      }),
    );
    expect(res.status).toBe(201);
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
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 7 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const qRes = await getQuestions(new Request("http://test", { headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: sessionId }),
    });
    const questions = (await qRes.json()) as { id: string }[];
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThan(35);
    expect(JSON.stringify(questions)).not.toContain("isCorrect");

    const ansRes = await postAnswer(
      new Request("http://test", {
        method: "POST",
        headers: { "x-test-user-id": "u1" },
        body: JSON.stringify({ questionId: questions[0].id, selectedOptionIds: ["a"] }),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(ansRes.status).toBe(200);

    const subRes = await postSubmit(new Request("http://test", { method: "POST", headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: sessionId }),
    });
    const submitted = (await subRes.json()) as {
      result: { total: number; passed: boolean };
      incorrectReview: { explanation: string; isCorrect: boolean }[];
    };
    expect(submitted.result.total).toBeGreaterThan(0);
    expect(typeof submitted.result.passed).toBe("boolean");
    expect(submitted.incorrectReview.length).toBeGreaterThan(0);
    expect(submitted.incorrectReview.every((item) => item.isCorrect === false)).toBe(true);
    expect(submitted.incorrectReview[0].explanation).toBeTruthy();
  });

  it("404 when questions requested for an unknown session", async () => {
    const res = await getQuestions(new Request("http://test", { headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("403 when a different user accesses an existing session", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 19 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const res = await getQuestions(new Request("http://test", { headers: { "x-test-user-id": "u2" } }), {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(res.status).toBe(403);
  });

  it("review is 404 before submit and 200 after submit", async () => {
    const createRes = await createExam(
      new Request("http://test/api/exam", {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-access-tier": "FREE" },
        body: JSON.stringify({ certLevel: "BASIC", locale: "EN", seed: 11 }),
      }),
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    const before = await getReview(new Request("http://test", { headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(before.status).toBe(404);

    await postSubmit(new Request("http://test", { method: "POST", headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: sessionId }),
    });

    const after = await getReview(new Request("http://test", { headers: { "x-test-user-id": "u1" } }), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(after.status).toBe(200);
    const items = (await after.json()) as unknown[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(35);
  });
});
