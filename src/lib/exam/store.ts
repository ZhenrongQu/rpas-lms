import type { ExamCertLevel, Locale, Question } from "../content/types";
import type { ExamResult } from "./score";

export interface ExamSession {
  id: string;
  userId?: string | null;
  certLevel: ExamCertLevel;
  locale: Locale;
  questionIds: string[];
  /** Full questions captured at creation; grading/review read these, not the live bank. */
  questionSnapshot: Question[];
  startedAt: number;
  expiresAt: number;
  answers: Record<string, string[]>;
  submitted: boolean;
  result?: ExamResult;
}

export interface SessionStore {
  create(session: ExamSession): Promise<void>;
  get(id: string): Promise<ExamSession | null>;
  update(session: ExamSession): Promise<void>;
  /**
   * Conditional write used by expiry settlement (PRD U2): stores `session` only
   * if the persisted row is still unsubmitted, and reports whether it won.
   *
   * The whole row — `submitted` AND `result` — must land in ONE atomic write.
   * A two-step "claim the row, then write the score" would let a concurrent
   * reader observe `submitted: true` with no result yet, which is exactly the
   * hung-session symptom this settlement exists to remove.
   */
  settleIfUnsubmitted(session: ExamSession): Promise<boolean>;
}

/** In-memory store for tests — the injectable double for ExamService.
 *  Production uses PrismaSessionStore. */
export class InMemorySessionStore implements SessionStore {
  private map = new Map<string, ExamSession>();

  async create(session: ExamSession): Promise<void> {
    this.map.set(session.id, structuredClone(session));
  }

  async get(id: string): Promise<ExamSession | null> {
    const s = this.map.get(id);
    return s ? structuredClone(s) : null;
  }

  async update(session: ExamSession): Promise<void> {
    this.map.set(session.id, structuredClone(session));
  }

  async settleIfUnsubmitted(session: ExamSession): Promise<boolean> {
    const current = this.map.get(session.id);
    if (!current || current.submitted) return false;
    this.map.set(session.id, structuredClone(session));
    return true;
  }
}
