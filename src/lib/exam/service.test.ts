import { describe, it, expect } from "vitest";
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
});
