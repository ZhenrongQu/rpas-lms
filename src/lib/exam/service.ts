import { randomUUID } from "node:crypto";
import { loadQuestionBankFromDB } from "../content/loadBank";
import { EXAM_SPECS, examQuestionCount } from "./config";
import { generateExam } from "./generate";
import { mulberry32 } from "./rng";
import { scoreExam, type ExamResult } from "./score";
import { toPublicQuestion, type PublicQuestion } from "./serialize";
import { orderedOptions } from "./optionOrder";
import { buildReview, type ReviewItem } from "./review";
import { questionsForAccess, type AccessTier } from "./access";
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
    private bankOverride?: QuestionBank,
  ) {}

  async createMock(
    certLevel: ExamCertLevel,
    locale: Locale,
    seed: number = Math.floor(Math.random() * 1e9),
    userId: string | null = null,
    // Defaults to the least-privileged tier (SEC-02): a caller that forgets to
    // pass accessTier gets the anonymous taster, never the full paid bank.
    accessTier: AccessTier = "GUEST",
  ): Promise<CreatedExam> {
    const spec = EXAM_SPECS[certLevel];
    const bank = this.bankOverride ?? (await loadQuestionBankFromDB(certLevel));
    const scopedBank: QuestionBank = {
      ...bank,
      questions: questionsForAccess(bank.questions, accessTier, certLevel),
    };
    const total = examQuestionCount(accessTier, certLevel);
    const questions = generateExam(certLevel, total, mulberry32(seed), scopedBank);
    const startedAt = this.now();
    const session: ExamSession = {
      id: randomUUID(),
      userId,
      certLevel,
      locale,
      questionIds: questions.map((q) => q.id),
      questionSnapshot: questions,
      startedAt,
      expiresAt: startedAt + spec.timeLimitMinutes * 60_000,
      answers: {},
      submitted: false,
    };
    await this.store.create(session);
    return { sessionId: session.id, expiresAt: session.expiresAt, total: questions.length };
  }

  /** Looks up a question from the session's snapshot — never the live bank. */
  private questionById(session: ExamSession, id: string): Question | undefined {
    return session.questionSnapshot.find((q) => q.id === id);
  }

  async getPublicQuestions(sessionId: string): Promise<PublicQuestion[] | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    return session.questionIds
      .map((id) => this.questionById(session, id))
      .filter((q): q is Question => Boolean(q))
      .map((q) => ({ ...q, options: orderedOptions(q.options, sessionId, q.id) }))
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
      .map((id) => this.questionById(session, id))
      .filter((q): q is Question => Boolean(q));
    const result = scoreExam(questions, session.answers, EXAM_SPECS[session.certLevel].passThreshold);
    session.result = result;
    await this.store.update(session);
    return result;
  }

  async submitWithIncorrectReview(
    sessionId: string,
  ): Promise<{ result: ExamResult; incorrectReview: ReviewItem[] } | null> {
    const result = await this.submit(sessionId);
    if (!result) return null;
    const review = await this.getReview(sessionId);
    return { result, incorrectReview: (review ?? []).filter((item) => !item.isCorrect) };
  }

  /** Minimal session metadata for the exam page (timer sizing). */
  async getSessionMeta(sessionId: string): Promise<{ certLevel: ExamCertLevel; expiresAt: number } | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    return { certLevel: session.certLevel, expiresAt: session.expiresAt };
  }

  async getSessionUserId(sessionId: string): Promise<string | null | undefined> {
    const session = await this.store.get(sessionId);
    return session ? session.userId ?? null : undefined;
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

  /** Post-submission review (null if missing or not yet submitted). Server-only. */
  async getReview(sessionId: string): Promise<ReviewItem[] | null> {
    const session = await this.store.get(sessionId);
    if (!session || !session.submitted) return null;
    const questions = session.questionIds
      .map((id) => this.questionById(session, id))
      .filter((q): q is Question => Boolean(q))
      .map((q) => ({ ...q, options: orderedOptions(q.options, sessionId, q.id) }));
    return buildReview(questions, session.answers, session.locale);
  }
}
