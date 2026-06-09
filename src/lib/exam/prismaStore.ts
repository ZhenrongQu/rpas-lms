import { prisma } from "../db";
import type { ExamCertLevel, Locale, Question } from "../content/types";
import type { ExamResult } from "./score";
import type { ExamSession, SessionStore } from "./store";

type Row = {
  id: string;
  userId: string | null;
  certLevel: string;
  locale: string;
  questionIds: string;
  questionSnapshot: string;
  answers: string;
  startedAt: Date;
  expiresAt: Date;
  submitted: boolean;
  result: string | null;
};

function toRow(s: ExamSession) {
  return {
    id: s.id,
    userId: s.userId ?? null,
    certLevel: s.certLevel,
    locale: s.locale,
    questionIds: JSON.stringify(s.questionIds),
    questionSnapshot: JSON.stringify(s.questionSnapshot),
    answers: JSON.stringify(s.answers),
    startedAt: new Date(s.startedAt),
    expiresAt: new Date(s.expiresAt),
    submitted: s.submitted,
    result: s.result ? JSON.stringify(s.result) : null,
  };
}

function fromRow(r: Row): ExamSession {
  return {
    id: r.id,
    userId: r.userId,
    certLevel: r.certLevel as ExamCertLevel,
    locale: r.locale as Locale,
    questionIds: JSON.parse(r.questionIds) as string[],
    questionSnapshot: JSON.parse(r.questionSnapshot) as Question[],
    answers: JSON.parse(r.answers) as Record<string, string[]>,
    startedAt: r.startedAt.getTime(),
    expiresAt: r.expiresAt.getTime(),
    submitted: r.submitted,
    result: r.result ? (JSON.parse(r.result) as ExamResult) : undefined,
  };
}

/** SQLite/Prisma-backed session store. Survives server restarts (Plan 3). */
export class PrismaSessionStore implements SessionStore {
  async create(session: ExamSession): Promise<void> {
    await prisma.examSession.create({ data: toRow(session) });
  }

  async get(id: string): Promise<ExamSession | null> {
    const row = await prisma.examSession.findUnique({ where: { id } });
    return row ? fromRow(row as Row) : null;
  }

  async update(session: ExamSession): Promise<void> {
    const { id, ...data } = toRow(session);
    await prisma.examSession.update({ where: { id }, data });
  }
}
