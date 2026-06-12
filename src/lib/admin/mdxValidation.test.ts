import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../db";
import { validateLessonMdxBodies } from "./mdxValidation";

const ACTIVE = "mdxtest-active-1";
const ACTIVE2 = "mdxtest-active-2";
const ARCHIVED = "mdxtest-archived-1";
const OTHER_MODULE = "mdxtest-nav-1";
const IDS = [ACTIVE, ACTIVE2, ARCHIVED, OTHER_MODULE];

async function seed(id: string, moduleId: string, status: "ACTIVE" | "ARCHIVED") {
  await prisma.basicQuestionBank.create({
    data: {
      id,
      moduleId,
      type: "SINGLE",
      selectCount: 1,
      difficulty: 0,
      stemEN: "S",
      stemZH: "S",
      explEN: "E",
      explZH: "E",
      refEN: "R",
      refZH: "R",
      tags: "[]",
      status,
      options: {
        create: [
          { optionId: "a", labelEN: "A", labelZH: "A", isCorrect: true },
          { optionId: "b", labelEN: "B", labelZH: "B", isCorrect: false },
        ],
      },
    },
  });
}

/** Wraps a body so it has prose + the given checkpoint markup. */
function body(checkpoints: string): string {
  return `Intro prose for the lesson.\n\n<Tip>Watch out.</Tip>\n\n## Heading\n\n${checkpoints}\n`;
}

const one = (id: string) => `<Checkpoint questionId="${id}" />`;

describe("validateLessonMdxBodies", () => {
  beforeAll(async () => {
    await prisma.basicQuestionBank.deleteMany({ where: { id: { in: IDS } } });
    await seed(ACTIVE, "air-law", "ACTIVE");
    await seed(ACTIVE2, "air-law", "ACTIVE");
    await seed(ARCHIVED, "air-law", "ARCHIVED");
    await seed(OTHER_MODULE, "navigation", "ACTIVE");
  });

  afterAll(async () => {
    await prisma.basicQuestionBank.deleteMany({ where: { id: { in: IDS } } });
    await prisma.$disconnect();
  });

  const valid = (cps: string) =>
    validateLessonMdxBodies({ bodyEN: body(cps), bodyZH: body(cps), moduleId: "air-law", course: "basic" });

  it("accepts a single valid Checkpoint", async () => {
    expect(await valid(one(ACTIVE))).toEqual({ ok: true });
  });

  it("accepts multiple valid Checkpoints", async () => {
    expect(await valid(`${one(ACTIVE)}\n\n${one(ACTIVE2)}`)).toEqual({ ok: true });
  });

  it("rejects invalid MDX syntax", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: `Drone under <5 m altitude ${one(ACTIVE)}`,
      bodyZH: body(one(ACTIVE)),
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.startsWith("EN: invalid MDX"))).toBe(true);
  });

  it("rejects an unknown capitalized component", async () => {
    const res = await valid(`<Foo />\n\n${one(ACTIVE)}`);
    expect(res.ok).toBe(false);
  });

  it("rejects import/export statements", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: `import x from "y"\n\n${body(one(ACTIVE))}`,
      bodyZH: body(one(ACTIVE)),
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("import/export"))).toBe(true);
  });

  it("rejects dangerous raw HTML", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: body(`<script>alert(1)</script>\n\n${one(ACTIVE)}`),
      bodyZH: body(one(ACTIVE)),
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("disallowed HTML"))).toBe(true);
  });

  it("rejects a Checkpoint with no questionId", async () => {
    const res = await valid(`<Checkpoint />`);
    expect(res.ok).toBe(false);
  });

  it("rejects an expression-prop Checkpoint", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: body(`<Checkpoint questionId={qid} />`),
      bodyZH: body(`<Checkpoint questionId={qid} />`),
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
  });

  it("rejects duplicate questionIds in a body", async () => {
    const res = await valid(`${one(ACTIVE)}\n\n${one(ACTIVE)}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects EN/ZH questionId-set mismatch", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: body(one(ACTIVE)),
      bodyZH: body(one(ACTIVE2)),
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("same Checkpoint questionId set"))).toBe(true);
  });

  it("rejects a cross-module questionId", async () => {
    const res = await valid(one(OTHER_MODULE));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("module"))).toBe(true);
  });

  it("rejects an archived questionId", async () => {
    const res = await valid(one(ARCHIVED));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("not an ACTIVE question"))).toBe(true);
  });

  it("rejects a lesson with zero Checkpoints", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: "Just prose, no checkpoint.",
      bodyZH: "只是文字，没有检查点。",
      moduleId: "air-law", course: "basic",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("at least one"))).toBe(true);
  });
});
