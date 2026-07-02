import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "../../db";
import { findActiveCheckpoint, findActiveQuestion } from "../../content/loadBank";
import { listCompletedLessonIds } from "../../lessons/progress";
import { listUserExamHistory } from "../../exam/history";
import type { Localized, Question } from "../../content/types";

/**
 * The harness's "hands". Every tool runs server-side and is scoped to the
 * authenticated session — `ctx.userId` comes from the verified session, NEVER
 * from a tool argument the model emits, so a student can't ask the assistant to
 * read another student's data. The tool *surface* is the security boundary
 * (there is simply no tool that reads other users or writes anything), not the
 * system prompt.
 */
export type ToolContext = {
  userId: string;
  locale: "EN" | "ZH";
};

function pick(l: Localized, locale: "EN" | "ZH"): string {
  return locale === "ZH" ? l.ZH : l.EN;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

// ── Tool schemas (what the model sees) ──────────────────────────────────────
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_course_content",
    description:
      "Search the RPAS course lessons for material relevant to the student's question " +
      "(theory, regulations, weather, navigation, procedures, etc.). Returns the most " +
      "relevant lesson bodies. Call this whenever answering needs course knowledge or " +
      "process/procedure details — do not answer regulatory or factual questions from memory.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords or the topic to search for." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_my_progress",
    description:
      "Get THIS student's own learning state: which lessons they've completed and their " +
      "mock-exam score history. Call this when the student asks what to study next, how " +
      "they're doing, or for advice personalised to their progress.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "explain_question",
    description:
      "Look up a single practice or mock-exam question by its id and return the stem, " +
      "options, correct answer, and the official explanation/reference, so you can teach " +
      "the underlying knowledge. Use when the student references a specific question id.",
    input_schema: {
      type: "object",
      properties: {
        questionId: { type: "string", description: "The question id, e.g. 'air-law-0001'." },
      },
      required: ["questionId"],
    },
  },
];

// ── Executors ───────────────────────────────────────────────────────────────
const SearchInput = z.object({ query: z.string().min(1).max(200) });
const ExplainInput = z.object({ questionId: z.string().min(1).max(80) });

async function searchCourseContent(rawInput: unknown, ctx: ToolContext): Promise<string> {
  const { query } = SearchInput.parse(rawInput);
  const select = {
    lessonId: true,
    moduleId: true,
    titleEN: true,
    titleZH: true,
    bodyEN: true,
    bodyZH: true,
  } as const;
  const [basic, advanced] = await Promise.all([
    prisma.basicLesson.findMany({ select }),
    prisma.advancedLesson.findMany({ select }),
  ]);
  const lessons = [...basic, ...advanced];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = lessons
    .map((l) => {
      const title = ctx.locale === "ZH" ? l.titleZH : l.titleEN;
      const body = ctx.locale === "ZH" ? l.bodyZH : l.bodyEN;
      const hay = `${l.moduleId} ${title} ${body}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        // Module/title hits weigh more than body hits.
        if (l.moduleId.toLowerCase().includes(t) || title.toLowerCase().includes(t)) score += 5;
        score += hay.split(t).length - 1;
      }
      return { l, title, body, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return `No lessons matched "${query}". Tell the student to rephrase, or ask which module they mean.`;
  }
  return scored
    .map((s) => `## ${s.title}  (module: ${s.l.moduleId}, lessonId: ${s.l.lessonId})\n${truncate(s.body, 1500)}`)
    .join("\n\n---\n\n");
}

async function getMyProgress(ctx: ToolContext): Promise<string> {
  const [completed, history] = await Promise.all([
    listCompletedLessonIds(ctx.userId),
    listUserExamHistory(ctx.userId, 20),
  ]);
  const exams = history
    .filter((e) => e.submitted)
    .map(
      (e) =>
        `- ${e.certLevel}: ${e.scorePct === null ? "n/a" : `${Math.round(e.scorePct * 100)}%`}` +
        `${e.passed === null ? "" : e.passed ? " (passed)" : " (not passed)"}`,
    );
  return [
    `Completed lessons (${completed.length}): ${completed.length ? completed.join(", ") : "none yet"}`,
    `Submitted mock exams (${exams.length}):`,
    exams.length ? exams.join("\n") : "- none yet",
  ].join("\n");
}

function formatQuestion(q: Question, locale: "EN" | "ZH"): string {
  const opts = q.options
    .map((o, i) => `${String.fromCharCode(65 + i)}. ${pick(o.label, locale)}${o.isCorrect ? "  ✓" : ""}`)
    .join("\n");
  return [
    `Question ${q.id} (module: ${q.moduleId}, ${q.type}):`,
    pick(q.stem, locale),
    "",
    opts,
    "",
    `Explanation: ${pick(q.explanation, locale)}`,
    pick(q.reference, locale) ? `Reference: ${pick(q.reference, locale)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function explainQuestion(rawInput: unknown, ctx: ToolContext): Promise<string> {
  const { questionId } = ExplainInput.parse(rawInput);

  // Integrity guard: if this question is in a mock exam the student has open
  // right now (started, not submitted, not expired), don't hand over the answer —
  // that would make the in-progress attempt meaningless. Past/closed exams are
  // fair game for study.
  const active = await prisma.examSession.findFirst({
    where: { userId: ctx.userId, submitted: false, expiresAt: { gt: new Date() } },
    select: { questionIds: true },
  });
  if (active) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(active.questionIds) as string[];
    } catch {
      ids = [];
    }
    if (ids.includes(questionId)) {
      return (
        "This question is part of the student's CURRENTLY ACTIVE mock exam. Do not reveal the " +
        "answer or explanation now. Encourage them to finish and submit the exam, then review it."
      );
    }
  }

  const q = (await findActiveCheckpoint(questionId)) ?? (await findActiveQuestion(questionId));
  if (!q) return `No active question found with id "${questionId}".`;
  return formatQuestion(q, ctx.locale);
}

/**
 * Dispatch one tool call. Errors are caught and returned as the tool result
 * string (never thrown) so the model sees the failure and can adapt, exactly
 * like the harness handing an error back into the loop.
 */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  try {
    switch (name) {
      case "search_course_content":
        return await searchCourseContent(input, ctx);
      case "get_my_progress":
        return await getMyProgress(ctx);
      case "explain_question":
        return await explainQuestion(input, ctx);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tool "${name}" failed: ${msg}`;
  }
}
