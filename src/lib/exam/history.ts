import { prisma } from "../db";
import { examService } from "./instance";
import type { ExamResult } from "./score";

export interface ExamHistoryItem {
  id: string;
  certLevel: string;
  submitted: boolean;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: number;
}

/**
 * Settles the user's expired-but-unsubmitted sessions (PRD U2). History is a bulk
 * read that never touches ExamService.loadSession, so without this an abandoned
 * attempt would sit in the list as permanently "in progress" — the visible half
 * of DEF-002. Reuses the service so there is one settlement path, not two.
 */
async function settleExpiredSessions(userId: string): Promise<void> {
  const stale = await prisma.examSession.findMany({
    where: { userId, submitted: false, expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  await Promise.all(stale.map((s) => examService.getResult(s.id)));
}

export async function listUserExamHistory(userId: string, limit = 10): Promise<ExamHistoryItem[]> {
  await settleExpiredSessions(userId);
  const rows = await prisma.examSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    const result = r.result ? (JSON.parse(r.result) as ExamResult) : null;
    return {
      id: r.id,
      certLevel: r.certLevel,
      submitted: r.submitted,
      scorePct: result?.scorePct ?? null,
      passed: result?.passed ?? null,
      startedAt: r.startedAt.getTime(),
    };
  });
}
