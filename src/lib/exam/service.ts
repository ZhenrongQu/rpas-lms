import { randomUUID } from "node:crypto";
import { loadQuestionBankFromDB } from "../content/loadBank";
import { EXAM_SPECS, GUEST_SESSION_TTL_MS, examQuestionCount } from "./config";
import { eligible, generateExam } from "./generate";
import { InsufficientQuestionPoolError } from "./errors";
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

    // DEF-003 / U1: generateExam returns min(total, poolSize). Without this guard a
    // thin pool silently produced a short paper that was still graded against the
    // level's pass threshold — a false readiness signal. Count the level-eligible
    // subset, not scopedBank.questions.length: generateExam filters by certLevel
    // again internally, so the raw length overstates what is actually drawable.
    const available = eligible(scopedBank.questions, certLevel).length;
    if (available < total) {
      throw new InsufficientQuestionPoolError(certLevel, available, total);
    }

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

  /** The session's questions, in order, from its own snapshot. */
  private snapshotQuestions(session: ExamSession): Question[] {
    return session.questionIds
      .map((id) => this.questionById(session, id))
      .filter((q): q is Question => Boolean(q));
  }

  /** The single grading path. Both learner submission and expiry settlement go
   *  through here, so a timed-out exam is never scored by different rules. */
  private score(session: ExamSession): ExamResult {
    return scoreExam(
      this.snapshotQuestions(session),
      session.answers,
      EXAM_SPECS[session.certLevel].passThreshold,
    );
  }

  /**
   * The only way this service reads a session (DEF-002 / PRD U2).
   *
   * The server used to trust the client's timer to submit: close the tab mid-exam
   * and the session hung unsubmitted forever, with the answers effectively lost.
   * Now any read of an expired, unsubmitted session grades it from the answers
   * already saved and persists the result — no cron, no new session concept.
   *
   * Settlement is idempotent under concurrency: the score is computed first and
   * handed to `settleIfUnsubmitted`, which writes it atomically. Whoever loses
   * that race re-reads the winner's finished row instead of scoring again.
   */
  private async loadSession(sessionId: string): Promise<ExamSession | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    // U6: an ownerless session is guarded only by its unguessable id, so it stops
    // being addressable after 24 hours. Checked before settlement — there is no
    // point grading a session nobody can reach, and no history for it to show up in.
    if (!session.userId && session.startedAt + GUEST_SESSION_TTL_MS <= this.now()) return null;
    if (session.submitted || session.expiresAt > this.now()) return session;

    const settled: ExamSession = {
      ...session,
      submitted: true,
      result: { ...this.score(session), timedOut: true },
    };
    if (await this.store.settleIfUnsubmitted(settled)) return settled;
    return this.store.get(sessionId);
  }

  async getPublicQuestions(sessionId: string): Promise<PublicQuestion[] | null> {
    const session = await this.loadSession(sessionId);
    if (!session) return null;
    return this.snapshotQuestions(session)
      .map((q) => ({ ...q, options: orderedOptions(q.options, sessionId, q.id) }))
      .map((q) => toPublicQuestion(q, session.locale));
  }

  /** Returns false if session missing, already submitted, expired, or question not in session. */
  async answer(sessionId: string, questionId: string, selected: string[]): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session || session.submitted) return false;
    if (session.expiresAt <= this.now()) return false;
    if (!session.questionIds.includes(questionId)) return false;
    session.answers[questionId] = selected;
    await this.store.update(session);
    return true;
  }

  /** Scores the exam server-side, stores the result on the session, returns it. Always submittable (timer expiry auto-submits client-side). */
  async submit(sessionId: string): Promise<ExamResult | null> {
    const session = await this.loadSession(sessionId);
    if (!session) return null;
    // Already submitted — by the learner, or by expiry settlement inside
    // loadSession, in which case the stored result carries timedOut.
    if (session.submitted) return session.result ?? null;
    session.submitted = true;
    session.result = this.score(session);
    await this.store.update(session);
    return session.result;
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
    const session = await this.loadSession(sessionId);
    if (!session) return null;
    return { certLevel: session.certLevel, expiresAt: session.expiresAt };
  }

  async getSessionUserId(sessionId: string): Promise<string | null | undefined> {
    const session = await this.loadSession(sessionId);
    return session ? session.userId ?? null : undefined;
  }

  /** For server components: expiresAt to initialize the client timer. */
  async getExpiresAt(sessionId: string): Promise<number | null> {
    const session = await this.loadSession(sessionId);
    return session?.expiresAt ?? null;
  }

  /** For the results page: stored result (null if not submitted yet). */
  async getResult(sessionId: string): Promise<ExamResult | null> {
    const session = await this.loadSession(sessionId);
    return session?.result ?? null;
  }

  /** Post-submission review (null if missing or not yet submitted). Server-only. */
  async getReview(sessionId: string): Promise<ReviewItem[] | null> {
    const session = await this.loadSession(sessionId);
    if (!session || !session.submitted) return null;
    const questions = this.snapshotQuestions(session).map((q) => ({
      ...q,
      options: orderedOptions(q.options, sessionId, q.id),
    }));
    return buildReview(questions, session.answers, session.locale);
  }
}
