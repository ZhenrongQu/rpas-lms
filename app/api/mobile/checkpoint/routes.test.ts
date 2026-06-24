import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getCheckpoint } from "./[id]/route";
import { POST as checkCheckpoint } from "./check/route";
import { prisma } from "../../../../src/lib/db";

const CP_QID = "cp-mobile-air-law-9001";
const CP_ARCHIVED = "cp-mobile-air-law-9002";
const EXAM_QID = "test-mobile-exam-air-law-9001";

async function seedCheckpoint(id: string, status: "ACTIVE" | "ARCHIVED") {
  await prisma.checkpointQuestion.create({
    data: {
      id,
      lessonId: "basic/air-law/intro-1",
      course: "basic",
      moduleId: "air-law",
      order: 0,
      type: "SINGLE",
      selectCount: 1,
      stemEN: "Mobile checkpoint stem EN",
      stemZH: "移动练习题干",
      explEN: "Because of these mobile EN reasons",
      explZH: "因为这些移动端原因",
      refEN: "Mobile reference EN",
      refZH: "移动端参考",
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

async function seedExamQuestion(id: string) {
  await prisma.basicQuestionBank.create({
    data: {
      id,
      moduleId: "air-law",
      type: "SINGLE",
      selectCount: 1,
      difficulty: 0,
      stemEN: "Exam stem",
      stemZH: "考试题干",
      explEN: "exam explanation",
      explZH: "考试解析",
      refEN: "exam reference",
      refZH: "考试参考",
      tags: "[]",
      status: "ACTIVE",
      options: {
        create: [
          { optionId: "a", labelEN: "A", labelZH: "甲", isCorrect: false },
          { optionId: "b", labelEN: "B", labelZH: "乙", isCorrect: true },
        ],
      },
    },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function cleanup() {
  await prisma.checkpointQuestion.deleteMany({ where: { id: { in: [CP_QID, CP_ARCHIVED] } } });
  await prisma.basicQuestionBank.deleteMany({ where: { id: EXAM_QID } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "mobile-checkpoint:" } } });
}

describe("mobile checkpoint API", () => {
  beforeAll(async () => {
    await cleanup();
    await seedCheckpoint(CP_QID, "ACTIVE");
    await seedCheckpoint(CP_ARCHIVED, "ARCHIVED");
    await seedExamQuestion(EXAM_QID);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("GET returns a localized public checkpoint question without answer data", async () => {
    const res = await getCheckpoint(new Request("http://test/api/mobile/checkpoint/id?locale=zh"), ctx(CP_QID));

    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    expect(text).not.toContain("correctOptionIds");
    const body = await res.json();
    expect(body).toMatchObject({
      id: CP_QID,
      moduleId: "air-law",
      stem: "移动练习题干",
      options: [
        { id: "a", label: "甲" },
        { id: "b", label: "乙" },
        { id: "c", label: "丙" },
        { id: "d", label: "丁" },
      ],
    });
  });

  it("GET returns 404 for unknown and archived checkpoint ids", async () => {
    expect((await getCheckpoint(new Request("http://test/api/mobile/checkpoint/cp-nope"), ctx("cp-nope"))).status).toBe(
      404,
    );
    expect((await getCheckpoint(new Request("http://test/api/mobile/checkpoint/archived"), ctx(CP_ARCHIVED))).status).toBe(
      404,
    );
  });

  it("POST grades a checkpoint question with localized explanation and reference", async () => {
    const res = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: CP_QID, selectedOptionIds: ["b"], locale: "zh" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      explanation: "因为这些移动端原因",
      reference: "移动端参考",
    });
  });

  it("POST accepts questionId for compatibility", async () => {
    const res = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        body: JSON.stringify({ questionId: CP_QID, selectedOptionIds: ["a"], locale: "en" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      explanation: "Because of these mobile EN reasons",
      reference: "Mobile reference EN",
    });
  });

  it("POST returns 400 for malformed JSON and invalid bodies", async () => {
    const malformed = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid JSON" });

    const invalid = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        body: JSON.stringify({ id: CP_QID, selectedOptionIds: "b" }),
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "invalid body" });
  });

  it("POST returns 404 for unknown and archived checkpoint ids without leaking answers", async () => {
    for (const id of ["cp-nope", CP_ARCHIVED]) {
      const res = await checkCheckpoint(
        new Request("http://test/api/mobile/checkpoint/check", {
          method: "POST",
          body: JSON.stringify({ id, selectedOptionIds: ["b"], locale: "en" }),
        }),
      );
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).not.toContain("correctOptionIds");
      expect(text).not.toContain("explanation");
      expect(text).not.toContain("reference");
    }
  });

  it("returns 429 on both endpoints when the mobile per-IP limit is locked", async () => {
    const ip = "198.51.100.75";
    await prisma.rateLimit.create({
      data: { key: `mobile-checkpoint:ip:${ip}`, lockedUntil: new Date(Date.now() + 5 * 60_000) },
    });
    const headers = { "x-forwarded-for": ip };

    const getRes = await getCheckpoint(new Request("http://test/api/mobile/checkpoint/id", { headers }), ctx(CP_QID));
    expect(getRes.status).toBe(429);

    const postRes = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: CP_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(postRes.status).toBe(429);

    await prisma.rateLimit.deleteMany({ where: { key: `mobile-checkpoint:ip:${ip}` } });
  });

  it("never resolves an exam-bank id through mobile checkpoint endpoints", async () => {
    expect((await getCheckpoint(new Request("http://test/api/mobile/checkpoint/exam"), ctx(EXAM_QID))).status).toBe(404);

    const res = await checkCheckpoint(
      new Request("http://test/api/mobile/checkpoint/check", {
        method: "POST",
        body: JSON.stringify({ id: EXAM_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("correctOptionIds");
    expect(text).not.toContain("explanation");
    expect(text).not.toContain("reference");
  });
});
