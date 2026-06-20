import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET as getCheckpoint } from "./[id]/route";
import { POST as checkCheckpoint } from "./check/route";
import { prisma } from "../../../src/lib/db";

// Synthetic ids that don't exist in the seeded banks, so this test owns its
// fixtures. CP_* live in the checkpoint bank; EXAM_QID lives in the EXAM bank
// and must NEVER resolve through the checkpoint endpoints (SEC-04).
const CP_QID = "cp-air-law-9001";
const CP_ARCHIVED = "cp-air-law-9002";
const EXAM_QID = "test-exam-air-law-9001";

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
      stemEN: "Checkpoint stem EN",
      stemZH: "练习题干",
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
      refEN: "r",
      refZH: "r",
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
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "checkpoint:" } } });
}

describe("checkpoint API (dedicated bank, SEC-04)", () => {
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

  it("GET returns the public checkpoint question without isCorrect", async () => {
    const res = await getCheckpoint(new Request("http://test?locale=en"), ctx(CP_QID));
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain("isCorrect");
    const body = await res.json();
    expect(body.id).toBe(CP_QID);
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBe(4);
  });

  it("GET 404 for unknown and archived checkpoint ids", async () => {
    expect((await getCheckpoint(new Request("http://test"), ctx("cp-nope-9999"))).status).toBe(404);
    expect((await getCheckpoint(new Request("http://test"), ctx(CP_ARCHIVED))).status).toBe(404);
  });

  it("POST check grades a checkpoint question and returns its explanation", async () => {
    const right = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: CP_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(right.status).toBe(200);
    const rbody = await right.json();
    expect(rbody.correct).toBe(true);
    expect(rbody.correctOptionIds).toEqual(["b"]);
    expect(rbody.explanation.length).toBeGreaterThan(0);
  });

  // SEC-04: the public checkpoint endpoints are rate-limited per IP so the
  // predictable cp-<module>-NNNN ids can't be enumerated to scrape the bank.
  it("returns 429 on both endpoints when the per-IP limit is locked", async () => {
    const IP = "198.51.100.50";
    await prisma.rateLimit.create({
      data: { key: `checkpoint:ip:${IP}`, lockedUntil: new Date(Date.now() + 5 * 60_000) },
    });
    const headers = { "x-forwarded-for": IP };
    const getRes = await getCheckpoint(new Request("http://test", { headers }), ctx(CP_QID));
    expect(getRes.status).toBe(429);
    const postRes = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        headers,
        body: JSON.stringify({ questionId: CP_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(postRes.status).toBe(429);
    await prisma.rateLimit.deleteMany({ where: { key: `checkpoint:ip:${IP}` } });
  });

  it("SEC-04: checkpoint endpoints never resolve an EXAM-bank id (no answer leak)", async () => {
    expect((await getCheckpoint(new Request("http://test"), ctx(EXAM_QID))).status).toBe(404);
    const res = await checkCheckpoint(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ questionId: EXAM_QID, selectedOptionIds: ["b"], locale: "en" }),
      }),
    );
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("correctOptionIds");
    expect(text).not.toContain("explanation");
  });
});
