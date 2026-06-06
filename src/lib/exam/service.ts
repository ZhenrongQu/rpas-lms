import { randomUUID } from "node:crypto";
import { loadQuestionBank } from "../content/loadBank";
import { EXAM_SPECS } from "./config";
import { generateExam } from "./generate";
import { mulberry32 } from "./rng";
import { scoreExam, type ExamResult } from "./score";
import { toPublicQuestion, type PublicQuestion } from "./serialize";
import type { SessionStore, ExamSession } from "./store";
import type { ExamCertLevel, Locale, Question, QuestionBank } from "../content/types";

export interface CreatedExam {
  sessionId: string;
  expiresAt: number;
  total: number;
}

/**
 * Orchestrates exam lifecycle using an injectable store, clock and bank.
 * All grading happens here (server side); clients only ever receive
 * public questions and, after submit, a scored result.
 */
export class ExamService {
  constructor(
    private store: SessionStore,
    private now: () => number = Date.now,
    private bank: QuestionBank = loadQuestionBank(),
  ) {}

  async createMock(
    certLevel: ExamCertLevel,
    locale: Locale,
    seed: number = Math.floor(Math.random() * 1e9),
  ): Promise<CreatedExam> {
    const spec = EXAM_SPECS[certLevel];
    const questions = generateExam(certLevel, spec.totalQuestions, mulberry32(seed), this.bank);
    const startedAt = this.now();
    const session: ExamSession = {
      id: randomUUID(),
      certLevel,
      locale,
      questionIds: questions.map((q) => q.id),
      startedAt,
      expiresAt: startedAt + spec.timeLimitMinutes * 60_000,
      answers: {},
      submitted: false,
    };
    await this.store.create(session);
    return { sessionId: session.id, expiresAt: session.expiresAt, total: questions.length };
  }

  private byId(id: string): Question | undefined {
    return this.bank.questions.find((q) => q.id === id);
  }

  async getPublicQuestions(sessionId: string): Promise<PublicQuestion[] | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    return session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q))
      .map((q) => toPublicQuestion(q, session.locale));
  }

  /** Returns false if session missing, already submitted, expired, or question not in session. */
  async answer(sessionId: string, questionId: string, selected: string[]): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session || session.submitted) return false;
    if (session.expiresAt <= this.now()) return false;
    if (!session.questionIds.includes(questionId)) return false;
    session.answers[questionId] = selected;
    await this.store.update(session);
    return true;
  }

  /** Scores the exam server-side, stores the result on the session, returns it. Always submittable (timer expiry auto-submits client-side). */
  async submit(sessionId: string): Promise<ExamResult | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    if (session.submitted) return session.result ?? null;
    session.submitted = true;
    const questions = session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q));
    const result = scoreExam(questions, session.answers, EXAM_SPECS[session.certLevel].passThreshold);
    session.result = result;
    await this.store.update(session);
    return result;
  }

  /** For server components: expiresAt to initialize the client timer. */
  async getExpiresAt(sessionId: string): Promise<number | null> {
    const session = await this.store.get(sessionId);
    return session?.expiresAt ?? null;
  }

  /** For the results page: stored result (null if not submitted yet). */
  async getResult(sessionId: string): Promise<ExamResult | null> {
    const session = await this.store.get(sessionId);
    return session?.result ?? null;
  }
}
