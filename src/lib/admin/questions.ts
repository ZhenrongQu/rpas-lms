import { prisma } from "../db";
import type { AdminQuestionInput } from "./contentSchemas";

/** Scalar Prisma fields for a Question write (options handled separately). */
export function questionScalarData(input: AdminQuestionInput) {
  return {
    moduleId: input.moduleId,
    certLevel: input.certLevel,
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

/** Next sequential id for a module, preserving the `${moduleId}-NNNN` scheme. */
export async function nextQuestionId(moduleId: string): Promise<string> {
  const rows = await prisma.question.findMany({ where: { moduleId }, select: { id: true } });
  let max = 0;
  for (const { id } of rows) {
    const m = id.match(/-(\d{4})$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `${moduleId}-${String(max + 1).padStart(4, "0")}`;
}

/** True if any lesson body references this question via <Checkpoint questionId="…" />. */
export async function isQuestionReferencedByLesson(id: string): Promise<boolean> {
  const needle = `questionId="${id}"`;
  const lesson = await prisma.lesson.findFirst({
    where: { OR: [{ bodyEN: { contains: needle } }, { bodyZH: { contains: needle } }] },
    select: { id: true },
  });
  return lesson !== null;
}
