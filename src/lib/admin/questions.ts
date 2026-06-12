import { prisma } from "../db";
import { questionBankPrefix, type ExamCertLevel } from "../content/types";
import type { AdminQuestionInput } from "./contentSchemas";

/** Scalar Prisma fields for a Question write (options handled separately).
 *  `certLevel` is omitted — it is fixed by the bank (schema @default). */
export function questionScalarData(input: AdminQuestionInput) {
  return {
    moduleId: input.moduleId,
    type: input.type,
    selectCount: input.selectCount,
    difficulty: input.difficulty,
    stemEN: input.stemEN,
    stemZH: input.stemZH,
    explEN: input.explEN,
    explZH: input.explZH,
    refEN: input.refEN,
    refZH: input.refZH,
    tags: JSON.stringify(input.tags),
    mediaKind: input.mediaKind ?? null,
    mediaUrl: input.mediaUrl ?? null,
    mediaAltEN: input.mediaAltEN ?? null,
    mediaAltZH: input.mediaAltZH ?? null,
  };
}

export function optionCreateData(input: AdminQuestionInput) {
  return input.options.map((o) => ({
    optionId: o.optionId,
    labelEN: o.labelEN,
    labelZH: o.labelZH,
    isCorrect: o.isCorrect,
  }));
}

/** Next sequential id for a module within a bank: `${bank}-${moduleId}-NNNN`
 *  (e.g. `basic-air-law-0001`). The bank prefix keeps ids globally unique so a
 *  lesson checkpoint can resolve a question by id alone. */
export async function nextQuestionId(moduleId: string, level: ExamCertLevel): Promise<string> {
  const rows =
    level === "BASIC"
      ? await prisma.basicQuestionBank.findMany({ where: { moduleId }, select: { id: true } })
      : await prisma.advancedQuestionBank.findMany({ where: { moduleId }, select: { id: true } });
  let max = 0;
  for (const { id } of rows) {
    const m = id.match(/-(\d{4})$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `${questionBankPrefix(level)}-${moduleId}-${String(max + 1).padStart(4, "0")}`;
}

/** Locates a question by id across both banks (basic first). Ids are bank-
 *  prefixed and globally unique, so the first hit is unambiguous. */
export async function findQuestionById(id: string) {
  const basic = await prisma.basicQuestionBank.findUnique({ where: { id }, include: { options: true } });
  if (basic) return { level: "BASIC" as const, row: basic };
  const advanced = await prisma.advancedQuestionBank.findUnique({ where: { id }, include: { options: true } });
  if (advanced) return { level: "ADVANCED" as const, row: advanced };
  return null;
}

/** True if any lesson body (basic or advanced) references this question via
 *  <Checkpoint questionId="…" />. */
export async function isQuestionReferencedByLesson(id: string): Promise<boolean> {
  const needle = `questionId="${id}"`;
  const where = { OR: [{ bodyEN: { contains: needle } }, { bodyZH: { contains: needle } }] };
  const [basic, advanced] = await Promise.all([
    prisma.basicLesson.findFirst({ where, select: { id: true } }),
    prisma.advancedLesson.findFirst({ where, select: { id: true } }),
  ]);
  return basic !== null || advanced !== null;
}
