import { describe, it, expect, vi } from "vitest";
import { ExamService } from "./service";
import { InsufficientQuestionPoolError } from "./errors";
import { InMemorySessionStore, type ExamSession } from "./store";
import { GUEST_SESSION_TTL_MS } from "./config";
import { makeTestBank } from "../content/__fixtures__/bank";
import { correctOptionIds } from "./grade";
import type { QuestionBank } from "../content/types";

const bank = makeTestBank();

/**
 * A full-size Basic bank (exactly 35 questions, so generation picks all of them)
 * whose `air-law-0001` entry has a flippable correct option. Used to prove an
 * in-flight exam grades from its own snapshot, not the live bank.
 */
function flippableBank(correctOptionId: "a" | "b"): QuestionBank {
  const filler = makeTestBank()
    .questions.filter((q) => q.certLevel === "BASIC" && q.difficulty === 1)
    .slice(0, 34)
    .map((q) => structuredClone(q));
  return {
    schemaVersion: 1,
    questions: [
      {
        id: "air-law-0001",
        moduleId: "air-law",
        certLevel: "BASIC",
        type: "SINGLE",
        selectCount: 1,
        difficulty: 1,
        stem: { EN: "Q?", ZH: "问题?" },
        options: [
          { id: "a", label: { EN: "A", ZH: "甲" }, isCorrect: correctOptionId === "a" },
          { id: "b", label: { EN: "B", ZH: "乙" }, isCorrect: correctOptionId === "b" },
        ],
        explanation: { EN: "e", ZH: "e" },
        reference: { EN: "r", ZH: "r" },
        tags: [],
      },
      ...filler,
    ],
  };
}

function newService() {
  return new ExamService(new InMemorySessionStore(), () => 1_000, bank);
}

describe("ExamService", () => {
  it("creates a Basic mock with 35 questions and a 90-minute expiry", async () => {
    const svc = newService();
    const created = await svc.createMock("BASIC", "EN", 42, null, "PAID");
    expect(created.total).toBe(35);
    expect(created.expiresAt).toBe(1_000 + 90 * 60_000);
    expect(typeof created.sessionId).toBe("string");
  });

  it("creates a Chinese Basic mock", async () => {
    const svc = newService();
    const created = await svc.createMock("BASIC", "ZH", 42);
    const questions = await svc.getPublicQuestions(created.sessionId);
    expect(questions).not.toBeNull();
    expect(questions![0].stem).toBeTruthy();
  });

  it("free users receive a full 35-question Basic exam of difficulty 1 questions", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const created = await svc.createMock("BASIC", "EN", 42, "user-123", "FREE");
    const session = await store.get(created.sessionId);

    expect(created.total).toBe(35);
    expect(session?.questionIds.length).toBe(created.total);
    expect(session?.questionIds.every((id) => {
      const q = bank.questions.find((item) => item.id === id);
      return q?.difficulty === 1;
    })).toBe(true);
  });

  it("guests receive a 15-question Basic taster of difficulty 0 questions", async () => {
    const store = new InMemorySessionStore();
    const svc = new ExamService(store, () => 1_000, bank);
    const created = await svc.createMock("BASIC", "EN", 42, null, "GUEST");
    const session = await store.get(created.sessionId);

    expect(created.total).toBe(15);
    expect(session?.userId).toBeNull();
    expect(session?.questionIds.length).toBe(15);
    expect(session?.questionIds.every((id) => {
      const q = bank.questions.find((item) => item.id === id);
      return q?.difficulty === 0;
    })).toBe(true);
  });

  it("serves public questions without leaking isCorrect", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, null, "PAID");
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
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, null, "PAID");
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
    const service = new ExamService(store, nowFn, makeTestBank());
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
    const service = new ExamService(store, nowFn, makeTestBank());
    const { sessionId } = await service.createMock("BASIC", "EN", 1);
    const questions = await service.getPublicQuestions(sessionId);
    const firstId = questions![0].id;
    const ok = await service.answer(sessionId, firstId, ["a"]);
    expect(ok).toBe(true);
  });

  it("getExpiresAt() returns the session expiresAt", async () => {
    const store = new InMemorySessionStore();
    const service = new ExamService(store, Date.now, makeTestBank());
    const { sessionId, expiresAt } = await service.createMock("BASIC", "EN", 1);
    const retrieved = await service.getExpiresAt(sessionId);
    expect(retrieved).toBe(expiresAt);
  });

  it("getResult() is null before submit, non-null after submit", async () => {
    const store = new InMemorySessionStore();
    const service = new ExamService(store, Date.now, makeTestBank());
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
    const service = new ExamService(store, Date.now, makeTestBank());
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

  it("createMock defaults to the GUEST taster (least privilege) when tier omitted", async () => {
    // SEC-02: an omitted accessTier must fail to the smallest pool (15-question
    // difficulty-0 Basic taster), never the full paid bank.
    const svc = newService();
    const created = await svc.createMock("BASIC", "EN", 42);
    expect(created.total).toBe(15);
  });

  it("getReview() is null before submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42);
    expect(await svc.getReview(sessionId)).toBeNull();
  });

  it("getReview() returns one item per question after submit", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, null, "PAID");
    await svc.submit(sessionId);
    const review = await svc.getReview(sessionId);
    expect(review).not.toBeNull();
    expect(review!.length).toBe(35);
    expect(review![0]).toHaveProperty("correctOptionIds");
    expect(review![0]).toHaveProperty("explanation");
  });

  it("submitWithIncorrectReview() returns only incorrect questions with explanations", async () => {
    const svc = newService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 42, null, "PAID");
    const questions = await svc.getPublicQuestions(sessionId);
    const first = questions![0];
    await svc.answer(sessionId, first.id, ["not-a-real-option"]);

    const submitted = await svc.submitWithIncorrectReview(sessionId);

    expect(submitted).not.toBeNull();
    expect(submitted!.result.total).toBe(35);
    expect(submitted!.incorrectReview.length).toBeGreaterThan(0);
    expect(submitted!.incorrectReview.every((item) => item.isCorrect === false)).toBe(true);
    expect(submitted!.incorrectReview[0].explanation).toBeTruthy();
  });

  it("getReview() is null for an unknown session", async () => {
    const svc = newService();
    expect(await svc.getReview("missing")).toBeNull();
  });

  it("grades an in-flight exam from its snapshot even after the bank's correct answer changes", async () => {
    const liveBank = flippableBank("a"); // correct answer is "a" at creation time
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, liveBank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 1, null, "PAID");
    await svc.answer(sessionId, "air-law-0001", ["a"]);

    // Admin edits the live bank mid-exam: correct answer becomes "b".
    liveBank.questions[0].options[0].isCorrect = false;
    liveBank.questions[0].options[1].isCorrect = true;

    // The in-flight exam still grades "a" as correct — it reads its own snapshot.
    const result = await svc.submit(sessionId);
    expect(result!.correct).toBe(1); // only the answered question; the other 34 are blank
    expect(result!.scorePct).toBeCloseTo(1 / 35);

    // A brand-new exam built from the edited bank reflects the change: "a" is now wrong.
    const svc2 = new ExamService(new InMemorySessionStore(), () => 1_000, liveBank);
    const created2 = await svc2.createMock("BASIC", "EN", 1, null, "PAID");
    await svc2.answer(created2.sessionId, "air-law-0001", ["a"]);
    const result2 = await svc2.submit(created2.sessionId);
    expect(result2!.correct).toBe(0);
  });
});

// DEF-003 / PRD U1: generateExam returns min(total, poolSize), so a thin pool used
// to yield a short paper whose pass threshold was computed against the questions it
// happened to find — a false "you're ready" signal. Creation now refuses instead.
describe("question pool sufficiency", () => {
  function bankOf(count: number): QuestionBank {
    return {
      schemaVersion: 1,
      questions: makeTestBank()
        .questions.filter((q) => q.certLevel === "BASIC" && q.difficulty === 1)
        .slice(0, count),
    };
  }

  it("refuses to create when the scoped pool cannot fill a full paper", async () => {
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, bankOf(3));
    await expect(svc.createMock("BASIC", "EN", 1, "u1", "FREE")).rejects.toBeInstanceOf(
      InsufficientQuestionPoolError,
    );
  });

  it("carries the shortfall on the error for logs and the CMS bank-health view", async () => {
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, bankOf(3));
    const err = await svc.createMock("BASIC", "EN", 1, "u1", "FREE").catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientQuestionPoolError);
    expect(err.available).toBe(3);
    expect(err.required).toBe(35);
    expect(err.certLevel).toBe("BASIC");
  });

  it("creates normally when the pool is exactly the required size", async () => {
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, bankOf(35));
    const created = await svc.createMock("BASIC", "EN", 1, "u1", "FREE");
    expect(created.total).toBe(35);
  });

  it("counts only questions of the requested level, not the whole bank", async () => {
    // 40 questions in the bank, but every one of them is ADVANCED: a BASIC exam
    // must still be refused. Counting bank.questions.length would wrongly pass.
    const advancedOnly: QuestionBank = {
      schemaVersion: 1,
      questions: makeTestBank().questions.filter((q) => q.certLevel === "ADVANCED"),
    };
    const svc = new ExamService(new InMemorySessionStore(), () => 1_000, advancedOnly);
    await expect(svc.createMock("BASIC", "EN", 1, "u1", "PAID")).rejects.toBeInstanceOf(
      InsufficientQuestionPoolError,
    );
  });
});

// DEF-002 / PRD U2: the server used to trust the client timer. Close the tab
// mid-exam and the session hung unsubmitted forever — the answers already saved
// were, in effect, thrown away. Reading an expired session now grades it.
describe("expired session lazy settlement", () => {
  const NINETY_ONE_MINUTES = 91 * 60_000;

  function clockedService(store = new InMemorySessionStore()) {
    let now = 1_000;
    const svc = new ExamService(store, () => now, bank);
    return { svc, store, expire: () => { now = 1_000 + NINETY_ONE_MINUTES; } };
  }

  async function answerFirstCorrectly(svc: ExamService, store: InMemorySessionStore, sessionId: string) {
    const session = await store.get(sessionId);
    const q = session!.questionSnapshot[0];
    await svc.answer(sessionId, q.id, correctOptionIds(q));
  }

  it("grades an abandoned exam from the answers saved before the timeout", async () => {
    const { svc, store, expire } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");
    await answerFirstCorrectly(svc, store, sessionId);

    expire();
    const result = await svc.getResult(sessionId);

    expect(result).not.toBeNull();
    expect(result!.timedOut).toBe(true);
    expect(result!.total).toBe(35);
    expect(result!.correct).toBe(1);
    // …and it is persisted, not recomputed per read.
    expect((await store.get(sessionId))!.submitted).toBe(true);
  });

  it("makes the settled exam reviewable, like a submitted one", async () => {
    const { svc, expire } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");

    expire();
    const review = await svc.getReview(sessionId);

    expect(review).not.toBeNull();
    expect(review!.length).toBe(35);
  });

  it("settles exactly once under concurrent reads, and losers see the finished result", async () => {
    class CountingStore extends InMemorySessionStore {
      settles = 0;
      async settleIfUnsubmitted(session: ExamSession): Promise<boolean> {
        const won = await super.settleIfUnsubmitted(session);
        if (won) this.settles++;
        return won;
      }
    }
    const store = new CountingStore();
    const { svc, expire } = clockedService(store);
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");

    expire();
    const [result, review, meta] = await Promise.all([
      svc.getResult(sessionId),
      svc.getReview(sessionId),
      svc.getSessionMeta(sessionId),
    ]);

    expect(store.settles).toBe(1);
    // The readers that lost the race must still see a fully written row — a
    // "submitted but no result yet" read is the hang this fix removes.
    expect(result!.timedOut).toBe(true);
    expect(review).not.toBeNull();
    expect(meta).not.toBeNull();
  });

  it("submitting after the deadline returns the settled result rather than regrading", async () => {
    const { svc, store, expire } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");
    await answerFirstCorrectly(svc, store, sessionId);

    expire();
    const settled = await svc.getResult(sessionId);
    const submitted = await svc.submit(sessionId);

    expect(submitted).toEqual(settled);
    expect(submitted!.timedOut).toBe(true);
  });

  it("leaves a normally submitted exam untouched", async () => {
    const { svc, store, expire } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");
    await answerFirstCorrectly(svc, store, sessionId);
    const onTime = await svc.submit(sessionId);
    expect(onTime!.timedOut).toBeUndefined();

    expire();
    expect(await svc.getResult(sessionId)).toEqual(onTime);
  });

  it("does not settle a session that is still running", async () => {
    const { svc, store } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");

    expect(await svc.getResult(sessionId)).toBeNull();
    expect((await store.get(sessionId))!.submitted).toBe(false);
  });

  it("rejects new answers on an expired session", async () => {
    const { svc, store, expire } = clockedService();
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, "u1", "PAID");
    const q = (await store.get(sessionId))!.questionSnapshot[0];

    expire();
    expect(await svc.answer(sessionId, q.id, correctOptionIds(q))).toBe(false);
  });
});

// PRD U6: an anonymous session is reachable by its unguessable id alone, so it
// should not stay addressable forever.
describe("guest session lifetime", () => {
  function serviceAt(startNow: number) {
    let now = startNow;
    return { svc: new ExamService(new InMemorySessionStore(), () => now, bank), set: (t: number) => { now = t; } };
  }

  it("stops serving an ownerless session after 24 hours", async () => {
    const { svc, set } = serviceAt(1_000);
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, null, "GUEST");

    set(1_000 + GUEST_SESSION_TTL_MS + 1);

    expect(await svc.getSessionMeta(sessionId)).toBeNull();
    expect(await svc.getPublicQuestions(sessionId)).toBeNull();
    expect(await svc.getResult(sessionId)).toBeNull();
  });

  it("keeps serving it right up to the boundary", async () => {
    const { svc, set } = serviceAt(1_000);
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, null, "GUEST");

    set(1_000 + GUEST_SESSION_TTL_MS - 1);

    expect(await svc.getSessionMeta(sessionId)).not.toBeNull();
  });

  it("does not expire a claimed session — ownership makes it permanent", async () => {
    const store = new InMemorySessionStore();
    let now = 1_000;
    const svc = new ExamService(store, () => now, bank);
    const { sessionId } = await svc.createMock("BASIC", "EN", 7, null, "GUEST");

    // Claiming is what registration does: it writes an owner onto the session.
    const claimed = await store.get(sessionId);
    await store.update({ ...claimed!, userId: "u1" });
    now = 1_000 + GUEST_SESSION_TTL_MS * 10;

    expect(await svc.getSessionMeta(sessionId)).not.toBeNull();
  });
});
