import { prisma } from "../db";
import type { AdminCheckpointInput } from "./contentSchemas";

/** Scalar Prisma fields for a CheckpointQuestion write (options handled separately). */
export function checkpointScalarData(input: AdminCheckpointInput) {
  return {
    lessonId: input.lessonId,
    course: input.course,
    moduleId: input.moduleId,
    order: input.order,
    type: input.type,
    selectCount: input.selectCount,
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

export function checkpointOptionCreateData(input: AdminCheckpointInput) {
  return input.options.map((o) => ({
    optionId: o.optionId,
    labelEN: o.labelEN,
    labelZH: o.labelZH,
    isCorrect: o.isCorrect,
  }));
}

/** Next sequential id for a module in the checkpoint bank: `cp-${moduleId}-NNNN`. */
export async function nextCheckpointId(moduleId: string): Promise<string> {
  const rows = await prisma.checkpointQuestion.findMany({ where: { moduleId }, select: { id: true } });
  let max = 0;
  for (const { id } of rows) {
    const m = id.match(/-(\d{4})$/);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `cp-${moduleId}-${String(max + 1).padStart(4, "0")}`;
}

export async function findCheckpointById(id: string) {
  return prisma.checkpointQuestion.findUnique({ where: { id }, include: { options: true } });
}

/** All lessons (both courses) as options for the CMS course→module→lesson picker. */
export async function listLessonOptions(): Promise<
  { lessonId: string; course: string; moduleId: string; title: string }[]
> {
  const select = { lessonId: true, course: true, moduleId: true, titleEN: true } as const;
  const orderBy = [{ moduleId: "asc" as const }, { order: "asc" as const }];
  const [basic, advanced] = await Promise.all([
    prisma.basicLesson.findMany({ select, orderBy }),
    prisma.advancedLesson.findMany({ select, orderBy }),
  ]);
  return [...basic, ...advanced].map((l) => ({
    lessonId: l.lessonId,
    course: l.course,
    moduleId: l.moduleId,
    title: l.titleEN,
  }));
}
