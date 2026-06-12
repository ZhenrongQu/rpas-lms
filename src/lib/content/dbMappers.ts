import type { Course, LessonMeta, RouteLocale } from "../lessons/types";
import type {
  CertLevel,
  ModuleId,
  Question,
  QuestionBank,
  QuestionType,
} from "./types";

// Structural row shapes. Basic*/Advanced* tables are physically separate but
// column-identical, so one structural type maps both — no coupling to a model name.
type OptionRow = { optionId: string; labelEN: string; labelZH: string; isCorrect: boolean };
type QuestionRow = {
  id: string;
  moduleId: string;
  certLevel: string;
  type: string;
  selectCount: number;
  difficulty: number;
  stemEN: string;
  stemZH: string;
  explEN: string;
  explZH: string;
  refEN: string;
  refZH: string;
  tags: string;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaAltEN: string | null;
  mediaAltZH: string | null;
  options: OptionRow[];
};
type LessonRow = {
  lessonId: string;
  course: string;
  moduleId: string;
  slug: string;
  titleEN: string;
  titleZH: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  bodyEN: string;
  bodyZH: string;
};

/** Prisma Question (+ its options) → the in-app `Question` shape from types.ts. */
export function dbQuestionToQuestion(row: QuestionRow): Question {
  const options = row.options
    .slice()
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((o) => ({
      id: o.optionId,
      label: { EN: o.labelEN, ZH: o.labelZH },
      isCorrect: o.isCorrect,
    }));

  const question: Question = {
    id: row.id,
    moduleId: row.moduleId as ModuleId,
    certLevel: row.certLevel as CertLevel,
    type: row.type as QuestionType,
    selectCount: row.selectCount,
    difficulty: row.difficulty,
    stem: { EN: row.stemEN, ZH: row.stemZH },
    options,
    explanation: { EN: row.explEN, ZH: row.explZH },
    reference: { EN: row.refEN, ZH: row.refZH },
    tags: JSON.parse(row.tags) as string[],
  };

  if (row.mediaKind && row.mediaUrl) {
    question.media = {
      kind: row.mediaKind as "image" | "video",
      url: row.mediaUrl,
      alt: { EN: row.mediaAltEN ?? "", ZH: row.mediaAltZH ?? "" },
    };
  }

  return question;
}

export function dbQuestionsToQuestionBank(rows: QuestionRow[]): QuestionBank {
  return { schemaVersion: 1, questions: rows.map(dbQuestionToQuestion) };
}

/** Prisma Lesson row → `LessonMeta`, selecting locale-specific title. */
export function dbLessonToMeta(row: LessonRow, locale: RouteLocale): LessonMeta {
  return {
    lessonId: row.lessonId,
    course: row.course as Course,
    moduleId: row.moduleId,
    slug: row.slug,
    title: locale === "zh" ? row.titleZH : row.titleEN,
    order: row.order,
    estMinutes: row.estMinutes,
    certLevel: row.certLevel as "BASIC" | "ADVANCED" | "BOTH",
    access: row.access as "FREE" | "PAID",
  };
}

/** Locale-specific raw MDX body for a Prisma Lesson row. */
export function dbLessonBody(row: Pick<LessonRow, "bodyEN" | "bodyZH">, locale: RouteLocale): string {
  return locale === "zh" ? row.bodyZH : row.bodyEN;
}
