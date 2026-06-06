import { prisma } from "../db";
import type { ExamResult } from "./score";

export interface ExamHistoryItem {
  id: string;
  certLevel: string;
  submitted: boolean;
  scorePct: number | null;
  passed: boolean | null;
  startedAt: number;
}

export async function listUserExamHistory(userId: string, limit = 10): Promise<ExamHistoryItem[]> {
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
