import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createExam } from "./route";
import { GET as getQuestions } from "./[id]/questions/route";
import { POST as postAnswer } from "./[id]/answer/route";
import { POST as postSubmit } from "./[id]/submit/route";
import { GET as getReview } from "./[id]/review/route";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { examService } from "../../../../src/lib/exam/instance";

vi.mock("../../../../src/lib/mobile/account", () => ({
  requireMobileAccount: vi.fn(),
}));

vi.mock("../../../../src/lib/exam/instance", () => ({
  examService: {
    createMock: vi.fn(),
    getSessionUserId: vi.fn(),
    getPublicQuestions: vi.fn(),
    answer: vi.fn(),
    submitWithIncorrectReview: vi.fn(),
    getReview: vi.fn(),
  },
}));

type AccessTier = "FREE" | "PAID";

function account(accessTier: AccessTier = "FREE", userId = "user_1") {
  return {
    ok: true as const,
    account: {
      userId,
      email: `${userId}@test.local`,
      name: "Learner",
      accessTier,
    },
  };
}

function unauthenticated() {
  return {
    ok: false as const,
    response: Response.json({ error: "authentication required" }, { status: 401 }),
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("mobile exam API route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMobileAccount).mockResolvedValue(account());
  });

  it("returns 401 for unauthenticated create requests", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue(unauthenticated());

    const res = await createExam(postJson("http://test/api/mobile/exam", { certLevel: "BASIC", locale: "EN" }));

    expect(examService.createMock).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("creates a Basic exam for a free mobile account", async () => {
    vi.mocked(examService.createMock).mockResolvedValue({
      sessionId: "exam_1",
      expiresAt: 123,
      total: 35,
    });

    const res = await createExam(
      postJson("http://test/api/mobile/exam", { certLevel: "BASIC", locale: "ZH", seed: 42 }),
    );

    expect(examService.createMock).toHaveBeenCalledWith("BASIC", "ZH", 42, "user_1", "FREE");
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ sessionId: "exam_1", expiresAt: 123, total: 35 });
  });

  it("forbids Advanced exam creation for a free mobile account", async () => {
    const res = await createExam(postJson("http://test/api/mobile/exam", { certLevel: "ADVANCED", locale: "EN" }));

    expect(examService.createMock).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "upgrade required" });
  });

  it("creates an Advanced exam for a paid mobile account", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue(account("PAID"));
    vi.mocked(examService.createMock).mockResolvedValue({
      sessionId: "exam_advanced",
      expiresAt: 456,
      total: 50,
    });

    const res = await createExam(postJson("http://test/api/mobile/exam", { certLevel: "ADVANCED", locale: "EN" }));

    expect(examService.createMock).toHaveBeenCalledWith("ADVANCED", "EN", undefined, "user_1", "PAID");
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ sessionId: "exam_advanced", expiresAt: 456, total: 50 });
  });

  it("rejects invalid JSON and invalid bodies for create", async () => {
    const invalidJson = await createExam(
      new Request("http://test/api/mobile/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toEqual({ error: "invalid JSON" });

    const invalidBody = await createExam(postJson("http://test/api/mobile/exam", { certLevel: "BASIC", locale: "FR" }));
    expect(invalidBody.status).toBe(400);
    await expect(invalidBody.json()).resolves.toEqual({ error: "invalid body" });
    expect(examService.createMock).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated owned route requests", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue(unauthenticated());

    const res = await getQuestions(new Request("http://test/api/mobile/exam/exam_1/questions"), ctx("exam_1"));

    expect(examService.getSessionUserId).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("returns owned public questions without answer data", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.getPublicQuestions).mockResolvedValue([
      {
        id: "q1",
        moduleId: "air-law",
        stem: "Question",
        type: "SINGLE",
        selectCount: 1,
        options: [{ id: "a", label: "A" }],
      },
    ]);

    const res = await getQuestions(new Request("http://test/api/mobile/exam/exam_1/questions"), ctx("exam_1"));

    expect(examService.getSessionUserId).toHaveBeenCalledWith("exam_1");
    expect(examService.getPublicQuestions).toHaveBeenCalledWith("exam_1");
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    expect(text).not.toContain("correctOptionIds");
    await expect(res.json()).resolves.toEqual([
      {
        id: "q1",
        moduleId: "air-law",
        stem: "Question",
        type: "SINGLE",
        selectCount: 1,
        options: [{ id: "a", label: "A" }],
      },
    ]);
  });

  it("returns 404 when the owned session is missing", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue(undefined);

    const res = await getQuestions(new Request("http://test/api/mobile/exam/missing/questions"), ctx("missing"));

    expect(examService.getPublicQuestions).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "session not found" });
  });

  it("returns 403 when a different mobile account owns the session", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("other_user");

    const res = await getQuestions(new Request("http://test/api/mobile/exam/exam_1/questions"), ctx("exam_1"));

    expect(examService.getPublicQuestions).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("records an answer for the owning mobile account", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.answer).mockResolvedValue(true);

    const res = await postAnswer(
      postJson("http://test/api/mobile/exam/exam_1/answer", {
        questionId: "q1",
        selectedOptionIds: ["a"],
      }),
      ctx("exam_1"),
    );

    expect(examService.answer).toHaveBeenCalledWith("exam_1", "q1", ["a"]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON and invalid bodies for answer", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");

    const invalidJson = await postAnswer(
      new Request("http://test/api/mobile/exam/exam_1/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      ctx("exam_1"),
    );
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toEqual({ error: "invalid JSON" });

    const invalidBody = await postAnswer(
      postJson("http://test/api/mobile/exam/exam_1/answer", {
        questionId: "q1",
        selectedOptionIds: "a",
      }),
      ctx("exam_1"),
    );
    expect(invalidBody.status).toBe(400);
    await expect(invalidBody.json()).resolves.toEqual({ error: "invalid body" });
    expect(examService.answer).not.toHaveBeenCalled();
  });

  it("returns 409 when the service rejects an answer", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.answer).mockResolvedValue(false);

    const res = await postAnswer(
      postJson("http://test/api/mobile/exam/exam_1/answer", {
        questionId: "q1",
        selectedOptionIds: ["a"],
      }),
      ctx("exam_1"),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "answer rejected" });
  });

  it("submits an owned mobile exam", async () => {
    const submitted = {
      result: { total: 1, correct: 1, scorePct: 1, passed: true, bySubject: [] },
      incorrectReview: [],
    };
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.submitWithIncorrectReview).mockResolvedValue(submitted);

    const res = await postSubmit(new Request("http://test/api/mobile/exam/exam_1/submit", { method: "POST" }), ctx("exam_1"));

    expect(examService.submitWithIncorrectReview).toHaveBeenCalledWith("exam_1");
    expect(await json(res)).toEqual({ status: 200, body: submitted });
  });

  it("returns 404 when submit returns null", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.submitWithIncorrectReview).mockResolvedValue(null);

    const res = await postSubmit(new Request("http://test/api/mobile/exam/exam_1/submit", { method: "POST" }), ctx("exam_1"));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "session not found" });
  });

  it("returns review for an owned mobile exam", async () => {
    const review = [
      {
        id: "q1",
        moduleId: "air-law",
        stem: "Question",
        options: [{ id: "a", label: "A", isCorrect: true }],
        selectedOptionIds: ["a"],
        correctOptionIds: ["a"],
        isCorrect: true,
        explanation: "Because",
        reference: "Ref",
      },
    ];
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.getReview).mockResolvedValue(review);

    const res = await getReview(new Request("http://test/api/mobile/exam/exam_1/review"), ctx("exam_1"));

    expect(examService.getReview).toHaveBeenCalledWith("exam_1");
    expect(await json(res)).toEqual({ status: 200, body: review });
  });

  it("returns 404 when review returns null", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.getReview).mockResolvedValue(null);

    const res = await getReview(new Request("http://test/api/mobile/exam/exam_1/review"), ctx("exam_1"));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not submitted or session not found" });
  });
});
