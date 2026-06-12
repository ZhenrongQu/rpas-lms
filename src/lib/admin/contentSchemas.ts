import { z } from "zod";
import { MODULE_IDS } from "../content/types";

/**
 * Validates an admin question-edit payload. Encodes the same invariants as the
 * file-bank QuestionSchema (SINGLE/MULTI correctness, unique option ids, module
 * whitelist, media completeness) so admin writes can't violate them.
 */
export const adminQuestionSchema = z
  .object({
    moduleId: z.enum(MODULE_IDS),
    // Which physical bank this question belongs to. There is no "BOTH": basic and
    // advanced questions live in separate tables.
    level: z.enum(["BASIC", "ADVANCED"]),
    type: z.enum(["SINGLE", "MULTI"]),
    selectCount: z.number().int().min(1),
    difficulty: z.number().int().min(0).max(3),
    stemEN: z.string().min(1),
    stemZH: z.string().min(1),
    explEN: z.string().min(1),
    explZH: z.string().min(1),
    refEN: z.string().min(1),
    refZH: z.string().min(1),
    tags: z.array(z.string()),
    mediaKind: z.enum(["image", "video"]).nullish(),
    mediaUrl: z.string().url().nullish(),
    mediaAltEN: z.string().nullish(),
    mediaAltZH: z.string().nullish(),
    options: z
      .array(
        z.object({
          optionId: z.string().min(1),
          labelEN: z.string().min(1),
          labelZH: z.string().min(1),
          isCorrect: z.boolean(),
        }),
      )
      .min(2),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "SINGLE" && (correct !== 1 || q.selectCount !== 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SINGLE questions need exactly 1 correct option and selectCount 1",
      });
    }
    if (q.type === "MULTI" && (correct !== q.selectCount || q.selectCount < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MULTI questions need selectCount ≥ 2 matching the number of correct options",
      });
    }
    const optionIds = new Set(q.options.map((o) => o.optionId));
    if (optionIds.size !== q.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Option ids must be unique" });
    }
    // Media is all-or-nothing.
    if (Boolean(q.mediaKind) !== Boolean(q.mediaUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Media needs both a kind and a URL, or neither",
      });
    }
  });

export type AdminQuestionInput = z.infer<typeof adminQuestionSchema>;

/**
 * Validates an admin lesson-edit payload. `course`/`moduleId`/`slug`/`lessonId`
 * are read-only (changing them would break LessonProgress FKs) and are not part
 * of this payload. MDX body safety is checked separately by mdxValidation.
 */
export const adminLessonSchema = z.object({
  titleEN: z.string().min(1),
  titleZH: z.string().min(1),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(1),
  certLevel: z.enum(["BASIC", "ADVANCED", "BOTH"]),
  access: z.enum(["FREE", "PAID"]),
  bodyEN: z.string().min(1),
  bodyZH: z.string().min(1),
});

export type AdminLessonInput = z.infer<typeof adminLessonSchema>;
