import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { nextQuestionId, findQuestionById } from "./questions";

// Question ids must be globally unique across the two physical banks: a lesson
// checkpoint references a question by id without knowing its bank, and
// findActiveQuestion/findQuestionById resolve basic-first. If basic and advanced
// could mint the same id, an advanced checkpoint would silently resolve to the
// basic question. These tests pin that invariant.

// An isolated module id no fixture uses, so the suite's shared DB is untouched.
const MOD = "zzz-id-collision-test";

const REQUIRED = {
  moduleId: MOD,
  type: "SINGLE",
  selectCount: 1,
  difficulty: 1,
  stemEN: "stem",
  stemZH: "题干",
  explEN: "expl",
  explZH: "解析",
  refEN: "ref",
  refZH: "出处",
};

async function cleanup() {
  await prisma.basicQuestionBank.deleteMany({ where: { moduleId: MOD } });
  await prisma.advancedQuestionBank.deleteMany({ where: { moduleId: MOD } });
}

describe("nextQuestionId — cross-bank id uniqueness", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("mints ids that never collide between basic and advanced for the same module", async () => {
    const basicId = await nextQuestionId(MOD, "BASIC");
    await prisma.basicQuestionBank.create({ data: { id: basicId, ...REQUIRED } });

    const advId = await nextQuestionId(MOD, "ADVANCED");
    await prisma.advancedQuestionBank.create({ data: { id: advId, ...REQUIRED } });

    expect(basicId).not.toBe(advId);
    // …and each id resolves to its own bank, not basic-first by accident.
    expect((await findQuestionById(basicId))?.level).toBe("BASIC");
    expect((await findQuestionById(advId))?.level).toBe("ADVANCED");
  });

  it("increments the sequence per bank+module", async () => {
    const first = await nextQuestionId(MOD, "BASIC");
    await prisma.basicQuestionBank.create({ data: { id: first, ...REQUIRED } });

    const second = await nextQuestionId(MOD, "BASIC");
    expect(second).not.toBe(first);
    expect(second.endsWith("0002")).toBe(true);
  });
});
