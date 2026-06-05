export type Locale = "EN" | "FR";
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
  FR: string;
}

export interface QuestionOption {
  id: string;
  label: Localized;
  isCorrect: boolean;
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
}

export interface QuestionBank {
  schemaVersion: 1;
  questions: Question[];
}
