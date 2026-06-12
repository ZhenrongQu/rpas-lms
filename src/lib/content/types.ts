export type Locale = "EN" | "ZH";
export type ExamCertLevel = "BASIC" | "ADVANCED";
export type QuestionType = "SINGLE" | "MULTI";

export const MODULE_IDS = [
  "air-law",
  "airframes-systems",
  "human-factors",
  "meteorology",
  "navigation",
  "flight-operations",
  "theory-of-flight",
  "radiotelephony",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** Per-bank prefix keeping question ids globally unique across the two physical
 *  banks. A lesson checkpoint resolves a question by id without knowing its
 *  bank, so basic and advanced must never mint the same id. */
export function questionBankPrefix(level: ExamCertLevel): "basic" | "adv" {
  return level === "BASIC" ? "basic" : "adv";
}

export interface Localized {
  EN: string;
  ZH: string;
}

export interface QuestionOption {
  id: string;
  label: Localized;
  isCorrect: boolean;
}

export interface QuestionMedia {
  kind: "image" | "video";
  url: string; // absolute CDN / object-storage URL
  alt: Localized; // accessibility / bilingual caption
}

export interface Question {
  id: string;
  moduleId: ModuleId;
  certLevel: ExamCertLevel;
  type: QuestionType;
  selectCount: number;
  difficulty: number;
  stem: Localized;
  options: QuestionOption[];
  explanation: Localized;
  reference: Localized;
  tags: string[];
  media?: QuestionMedia;
}

export interface QuestionBank {
  schemaVersion: 1;
  questions: Question[];
}
