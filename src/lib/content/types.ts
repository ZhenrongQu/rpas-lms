export type Locale = "EN" | "ZH";
export type CertLevel = "BASIC" | "ADVANCED" | "BOTH";
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
  certLevel: CertLevel;
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
