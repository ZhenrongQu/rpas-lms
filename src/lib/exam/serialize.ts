import type { Locale, Question } from "../content/types";

export interface PublicOption {
  id: string;
  label: string;
}

export interface PublicMedia {
  kind: "image" | "video";
  url: string;
  alt: string;
}

export interface PublicQuestion {
  id: string;
  moduleId: string;
  type: "SINGLE" | "MULTI";
  selectCount: number;
  stem: string;
  options: PublicOption[];
  media?: PublicMedia;
}

/**
 * Projects a Question to the client-safe shape for a locale.
 * Deliberately omits isCorrect, explanation and reference so correct
 * answers never reach the client during an exam.
 */
export function toPublicQuestion(q: Question, locale: Locale): PublicQuestion {
  return {
    id: q.id,
    moduleId: q.moduleId,
    type: q.type,
    selectCount: q.selectCount,
    stem: q.stem[locale],
    options: q.options.map((o) => ({ id: o.id, label: o.label[locale] })),
    ...(q.media ? { media: { kind: q.media.kind, url: q.media.url, alt: q.media.alt[locale] } } : {}),
  };
}
