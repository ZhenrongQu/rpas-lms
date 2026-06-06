import { describe, it, expect, vi } from "vitest";
import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";
import { loadQuestionBank } from "../content/loadBank";
import { correctOptionIds } from "./grade";

const bank = loadQuestionBank();

function newService() {
  return new ExamService(new InMemorySessionStore(), () => 1_000, bank);
}

describe("ExamService", () => {
  it("creates a Basic mock with 35 questions and a 90-minute expiry", async () => {
    const svc = newService();
    const created = await svc.createMock("BASIC", "EN", 42);
    expect(created.total).toBe(35);
    expect(created.expiresAt).toBe(1_000 + 90 * 60_000);
    expect(typeof created.sessionId).toBe("string");
  });

  it("serves public questions without leaking isCorrect", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    expect(questions).not.toBeNull();
    expect(questions!.length).toBe(35);
    expect(JSON.stringify(questions)).not.toContain("isCorrect");
  });

  it("rejects an answer for a question not in the session", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const ok = await svc.answer(sessionId, "not-in-exam-9999", ["a"]);
    expect(ok).toBe(false);
  });

  it("grades a fully-correct submission as 100% and passed", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    for (const pub of questions!) {
      const full = bank.questions.find((q) => q.id === pub.id)!;
      await svc.answer(sessionId, pub.id, correctOptionIds(full));
    }
    const result = await svc.submit(sessionId);
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(35);
    expect(result!.scorePct).toBe(1);
    expect(result!.passed).toBe(true);
  });

  it("does not accept answers after submission", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const questions = await svc.getPublicQuestions(sessionId);
    await svc.submit(sessionId);
    const ok = await svc.answer(sessionId, questions![0].id, ["a"]);
    expect(ok).toBe(false);
  });

  it("returns null for operations on an unknown session", async () => {
    const svc = newService();
    expect(await svc.getPublicQuestions("missing")).toBeNull();
    expect(await svc.submit("missing")).toBeNull();
  });

  it("answer() returns false after session expiresAt", async () => {
    const store = new InMemorySessionStore();
    const t0 = Date.now();
    const nowFn = vi.fn()
      .mockReturnValueOnce(t0)               // createMock reads now
      .mockReturnValue(t0 + 200 * 60_000);   // answer reads now — 200 min later (past both 60 & 90 min limits)
    const service = new ExamService(store, nowFn, loadQuestionBank());
    const { sessionId } = await service.createMock("BASIC", "EN", 1);
    const questions = await service.getPublicQuestions(sessionId);
    const firstId = questions![0].id;
    const ok = await service.answer(sessionId, firstId, ["a"]);
    expect(ok).toBe(false);
  });

  it("answer() accepts submissions before expiresAt", async () => {
    const store = new InMemorySessionStore();
    const t0 = Date.now();
    const nowFn = vi.fn().mockReturnValue(t0); // clock never advances
    const service = new ExamService(store, nowFn, loadQuestionBank());
    const { sessionId } = await service.createMock("BASIC", "EN", 1);
    const questions = await service.getPublicQuestions(sessionId);
    const firstId = questions![0].id;
    const ok = await service.answer(sessionId, firstId, ["a"]);
    expect(ok).toBe(true);
  });

  it("getExpiresAt() returns the session expiresAt", async () => {
    const store = new InMemorySessionStore();
    const service = new ExamService(store, Date.now, loadQuestionBank());
    const { sessionId, expiresAt } = await service.createMock("BASIC", "EN", 1);
    const retrieved = await service.getExpiresAt(sessionId);
    expect(retrieved).toBe(expiresAt);
  });

  it("getResult() is null before submit, non-null after submit", async () => {
    const store = new InMemorySessionStore();
    const service = new ExamService(store, Date.now, loadQuestionBank());
    const { sessionId } = await service.createMock("BASIC", "EN", 1);
    const before = await service.getResult(sessionId);
    expect(before).toBeNull();
    await service.submit(sessionId);
    const after = await service.getResult(sessionId);
    expect(after).not.toBeNull();
    expect(after).toHaveProperty("total");
    expect(after).toHaveProperty("passed");
    expect(after).toHaveProperty("bySubject");
  });

  it("submit() is idempotent — a second call returns the stored result", async () => {
    const store = new InMemorySessionStore();
    const service = new ExamService(store, Date.now, loadQuestionBank());
    const { sessionId } = await service.createMock("BASIC", "EN", 1);
    const first = await service.submit(sessionId);
    const second = await service.submit(sessionId);
    expect(second).toEqual(first);
  });

  it("createMock stores the userId on the session", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, "user-123");
    const session = await store.get(sessionId);
    expect(session?.userId).toBe("user-123");
  });

  it("createMock defaults userId to null when omitted", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const session = await store.get(sessionId);
    expect(session?.userId).toBeNull();
  });

  it("getReview() is null before submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    expect(await svc.getReview(sessionId)).toBeNull();
  });

  it("getReview() returns one item per question after submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    await svc.submit(sessionId);
    const review = await svc.getReview(sessionId);
    expect(review).not.toBeNull();
    expect(review!.length).toBe(35);
    expect(review![0]).toHaveProperty("correctOptionIds");
    expect(review![0]).toHaveProperty("explanation");
  });

  it("getReview() is null for an unknown session", async () => {
    const svc = newService();
    expect(await svc.getReview("missing")).toBeNull();
  });
});
