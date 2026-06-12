import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET as getCheckpoint } from "./[id]/route";
import { POST as checkCheckpoint } from "./check/route";
import { prisma } from "../../../src/lib/db";

// Synthetic ids that do not exist in the seeded bank, so this test owns its
// fixtures and never mutates shared questions.
const QID = "air-law-9001";
const ARCHIVED_QID = "air-law-9002";

async function seedQuestion(id: string, status: "ACTIVE" | "ARCHIVED") {
  await prisma.basicQuestionBank.create({
    data: {
      id,
      moduleId: "air-law",
      type: "SINGLE",
      selectCount: 1,
      difficulty: 0,
      stemEN: "Stem EN",
      stemZH: "题干",
      explEN: "Because of these EN reasons",
      explZH: "因为这些原因",
      refEN: "ref",
      refZH: "参考",
      tags: "[]",
      status,
      options: {
        create: [
          { optionId: "a", labelEN: "A", labelZH: "甲", isCorrect: false },
          { optionId: "b", labelEN: "B", labelZH: "乙", isCorrect: true },
          { optionId: "c", labelEN: "C", labelZH: "丙", isCorrect: false },
          { optionId: "d", labelEN: "D", labelZH: "丁", isCorrect: false },
        ],
      },
    },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("checkpoint API", () => {
  beforeAll(async () => {
    await prisma.basicQuestionBank.deleteMany({ where: { id: { in: [QID, ARCHIVED_QID] } } });
    await seedQuestion(QID, "ACTIVE");
    await seedQuestion(ARCHIVED_QID, "ARCHIVED");
  });

  afterAll(async () => {
    await prisma.basicQuestionBank.deleteMany({ where: { id: { in: [QID, ARCHIVED_QID] } } });
    await prisma.$disconnect();
  });

  it("GET returns the public question without isCorrect", async () => {
    const res = await getCheckpoint(new Request(`http://test?locale=en`), ctx(QID));
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    const body = await res.json();
    expect(body.id).toBe(QID);
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBe(4);
  });

  it("GET 404 for unknown id", async () => {
    const res = await getCheckpoint(new Request("http://test?locale=en"), ctx("nope-9999"));
    expect(res.status).toBe(404);
  });

  it("GET 404 for an archived question", async () => {
    const res = await getCheckpoint(new Request("http://test?locale=en"), ctx(ARCHIVED_QID));
    expect(res.status).toBe(404);
  });

  it("POST check grades correct vs incorrect and returns explanation", async () => {
    const right = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    const rbody = await right.json();
    expect(right.status).toBe(200);
    expect(rbody.correct).toBe(true);
    expect(rbody.explanation.length).toBeGreaterThan(0);

    const wrong = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: QID, selectedOptionIds: ["__no__"], locale: "en" }),
      }),
    );
    const wbody = await wrong.json();
    expect(wbody.correct).toBe(false);
    expect(wbody.correctOptionIds).toEqual(["b"]);
  });

  it("POST check 404 for an archived question", async () => {
    const res = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: ARCHIVED_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
