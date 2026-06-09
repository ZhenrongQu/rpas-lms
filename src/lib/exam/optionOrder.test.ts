import { describe, it, expect } from "vitest";
import { orderedOptions } from "./optionOrder";
import { ExamService } from "./service";
import { InMemorySessionStore } from "./store";
import { loadQuestionBank } from "../content/loadBank";
import { correctOptionIds } from "./grade";

const bank = loadQuestionBank();

const opts = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];

describe("orderedOptions", () => {
  it("is deterministic for the same session + question", () => {
    const a = orderedOptions(opts, "session-1", "air-law-0001");
    const b = orderedOptions(opts, "session-1", "air-law-0001");
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
  });

  it("preserves the exact set of option ids (no loss/duplication)", () => {
    const out = orderedOptions(opts, "session-xyz", "air-law-0001").map((o) => o.id).sort();
    expect(out).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate the input array", () => {
    const input = opts.slice();
    orderedOptions(input, "session-1", "air-law-0001");
    expect(input.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("produces different orders across sessions for at least one of several questions", () => {
    const qids = ["air-law-0001", "air-law-0002", "meteorology-0001", "navigation-0001"];
    const differs = qids.some((qid) => {
      const a = orderedOptions(opts, "session-A", qid).map((o) => o.id).join("");
      const b = orderedOptions(opts, "session-B", qid).map((o) => o.id).join("");
      return a !== b;
    });
    expect(differs).toBe(true);
  });
});

describe("ExamService option shuffling", () => {
  it("getPublicQuestions option order matches getReview option order", async () => {
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    const publicQs = await svc.getPublicQuestions(sessionId);
    await svc.submit(sessionId);
    const review = await svc.getReview(sessionId);

    const publicOrder = Object.fromEntries(
      publicQs!.map((q) => [q.id, q.options.map((o) => o.id)]),
    );
    for (const item of review!) {
      expect(item.options.map((o) => o.id)).toEqual(publicOrder[item.id]);
    }
  });

  it("grades correctly regardless of shuffled display order (grade-by-id invariant)", async () => {
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 7);
    const questions = await svc.getPublicQuestions(sessionId);
    for (const pub of questions!) {
      const full = bank.questions.find((q) => q.id === pub.id)!;
      await svc.answer(sessionId, pub.id, correctOptionIds(full));
    }
    const result = await svc.submit(sessionId);
    expect(result!.scorePct).toBe(1);
    expect(result!.passed).toBe(true);
  });
});
