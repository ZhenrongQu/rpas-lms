import { describe, it, expect } from "vitest";
import { prisma } from "../../db";
import { runTool, type ToolContext } from "./tools";

// The security properties of the agent's tools, verified deterministically (no
// LLM in the loop). These are the guarantees the model *cannot* override however
// it's prompted: scoping to the session user, and the active-exam integrity
// guard. Question banks + lessons are seeded by the global test setup.

const ctxFor = (userId: string): ToolContext => ({ userId, locale: "EN" });

async function reset() {
  await prisma.examSession.deleteMany();
  await prisma.basicLessonProgress.deleteMany();
  await prisma.advancedLessonProgress.deleteMany();
  await prisma.customer.deleteMany();
}

describe("chat tools — security & correctness", () => {
  it("get_my_progress is scoped to the session user (no cross-user leak)", async () => {
    await reset();
    const lesson = await prisma.basicLesson.findFirst();
    expect(lesson).not.toBeNull();
    await prisma.customer.createMany({
      data: [
        { id: "a", email: "a@t.local", hashedPassword: "x", accessTier: "PAID" },
        { id: "b", email: "b@t.local", hashedPassword: "x", accessTier: "PAID" },
      ],
    });
    await prisma.basicLessonProgress.create({ data: { userId: "b", lessonId: lesson!.lessonId } });

    const outA = await runTool("get_my_progress", {}, ctxFor("a"));
    expect(outA).not.toContain(lesson!.lessonId); // A must not see B's progress

    const outB = await runTool("get_my_progress", {}, ctxFor("b"));
    expect(outB).toContain(lesson!.lessonId);
  });

  it("explain_question returns the explanation for a question not in an active exam", async () => {
    await reset();
    const q = await prisma.basicQuestionBank.findFirst({ where: { status: "ACTIVE" } });
    expect(q).not.toBeNull();

    const out = await runTool("explain_question", { questionId: q!.id }, ctxFor("a"));
    expect(out).toContain(q!.id);
    expect(out).toContain("Explanation:");
  });

  it("explain_question refuses a question in the student's ACTIVE exam", async () => {
    await reset();
    const q = await prisma.basicQuestionBank.findFirst({ where: { status: "ACTIVE" } });
    await prisma.customer.create({
      data: { id: "a", email: "a@t.local", hashedPassword: "x", accessTier: "PAID" },
    });
    await prisma.examSession.create({
      data: {
        id: "ex-active-1",
        userId: "a",
        certLevel: "BASIC",
        locale: "EN",
        questionIds: JSON.stringify([q!.id]),
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        submitted: false,
      },
    });

    const out = await runTool("explain_question", { questionId: q!.id }, ctxFor("a"));
    expect(out.toLowerCase()).toContain("active");
    expect(out).not.toContain("Explanation:");

    // Another student with no active exam can still study the same question.
    const otherStudent = await runTool("explain_question", { questionId: q!.id }, ctxFor("z"));
    expect(otherStudent).toContain("Explanation:");
  });

  it("unknown tool returns an error string, never throws", async () => {
    const out = await runTool("delete_everything", { drop: true }, ctxFor("a"));
    expect(out).toContain("Unknown tool");
  });

  it("search_course_content returns lesson material for a known module", async () => {
    const lesson = await prisma.basicLesson.findFirst({ select: { moduleId: true } });
    expect(lesson).not.toBeNull();
    const out = await runTool("search_course_content", { query: lesson!.moduleId }, ctxFor("a"));
    expect(out).toContain(lesson!.moduleId);
    // Retrieved content is wrapped as untrusted DATA (prompt-injection defence).
    expect(out).toContain("<retrieved_passages>");
    expect(out).toContain("DATA, not instructions");
  });
});
