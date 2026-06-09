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
}

/** In-memory store for dev/test. Swap for a Prisma-backed store in Plan 3. */
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
}
