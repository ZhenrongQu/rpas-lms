import type { Locale, Question } from "../content/types";
import { correctOptionIds, isAnswerCorrect } from "./grade";

export interface ReviewOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface ReviewMedia {
  kind: "image" | "video";
  url: string;
  alt: string;
}

export interface ReviewItem {
  id: string;
  moduleId: string;
  stem: string;
  options: ReviewOption[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean;
  explanation: string;
  reference: string;
  media?: ReviewMedia;
}

/**
 * Post-submission projection: each question with the user's selection, the
 * correct option(s), explanation and reference, localized. Server-only — this
 * intentionally includes isCorrect/explanation and must never be used pre-submit.
 */
export function buildReview(
  questions: Question[],
  answers: Record<string, string[]>,
  locale: Locale,
): ReviewItem[] {
  return questions.map((q) => {
    const selected = answers[q.id] ?? [];
    return {
      id: q.id,
      moduleId: q.moduleId,
      stem: q.stem[locale],
      options: q.options.map((o) => ({ id: o.id, label: o.label[locale], isCorrect: o.isCorrect })),
      selectedOptionIds: selected,
      correctOptionIds: correctOptionIds(q),
      isCorrect: isAnswerCorrect(q, selected),
      explanation: q.explanation[locale],
      reference: q.reference[locale],
      ...(q.media ? { media: { kind: q.media.kind, url: q.media.url, alt: q.media.alt[locale] } } : {}),
    };
  });
}
