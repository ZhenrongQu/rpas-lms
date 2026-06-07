import { z } from "zod";
import { MODULE_IDS } from "./types";

const Localized = z.object({ EN: z.string().min(1), ZH: z.string().min(1) });

const Option = z.object({
  id: z.string().min(1),
  label: Localized,
  isCorrect: z.boolean(),
});

export const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z-]+-\d{4}$/),
    moduleId: z.enum(MODULE_IDS),
    certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
    type: z.enum(["SINGLE", "MULTI"]),
    selectCount: z.number().int().min(1),
    difficulty: z.number().int().min(0).max(3),
    stem: Localized,
    options: z.array(Option).min(2),
    explanation: Localized,
    reference: Localized,
    tags: z.array(z.string()),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "SINGLE" && (correct !== 1 || q.selectCount !== 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SINGLE question ${q.id} must have exactly 1 correct option and selectCount 1`,
      });
    }
    if (q.type === "MULTI" && (correct !== q.selectCount || q.selectCount < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `MULTI question ${q.id} must have selectCount>=2 correct options matching selectCount`,
      });
    }
    const optionIds = new Set(q.options.map((o) => o.id));
    if (optionIds.size !== q.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Question ${q.id} has duplicate option ids`,
      });
    }
  });

export const QuestionBankSchema = z
  .object({
    schemaVersion: z.literal(1),
    questions: z.array(QuestionSchema),
  })
  .superRefine((bank, ctx) => {
    const seen = new Set<string>();
    for (const q of bank.questions) {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question id ${q.id}`,
        });
      }
      seen.add(q.id);
    }
  });
