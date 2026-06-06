import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db";
import { PrismaSessionStore } from "./prismaStore";
import type { ExamSession } from "./store";

function sampleSession(id: string): ExamSession {
  return {
    id,
    userId: null,
    certLevel: "BASIC",
    locale: "EN",
    questionIds: ["air-law-0001", "navigation-0002"],
    startedAt: 1_000,
    expiresAt: 1_000 + 90 * 60_000,
    answers: {},
    submitted: false,
  };
}

describe("PrismaSessionStore", () => {
  beforeEach(async () => {
    await prisma.examSession.deleteMany();
  });

  afterAll(async () => {
    await prisma.examSession.deleteMany();
    await prisma.$disconnect();
  });

  it("creates and reads back a session unchanged", async () => {
    const store = new PrismaSessionStore();
    const s = sampleSession("sess-1");
    await store.create(s);
    const got = await store.get("sess-1");
    expect(got).toEqual(s);
  });

  it("returns null for an unknown session", async () => {
    const store = new PrismaSessionStore();
    expect(await store.get("nope")).toBeNull();
  });

  it("persists answers and result on update", async () => {
    const store = new PrismaSessionStore();
    const s = sampleSession("sess-2");
    await store.create(s);
    s.answers["air-law-0001"] = ["a", "c"];
    s.submitted = true;
    s.result = {
      total: 2,
      correct: 1,
      scorePct: 0.5,
      passed: false,
      bySubject: [{ moduleId: "air-law", correct: 1, total: 1 }],
    };
    await store.update(s);
    const got = await store.get("sess-2");
    expect(got).toEqual(s);
  });

  it("is durable across store instances (real persistence)", async () => {
    await new PrismaSessionStore().create(sampleSession("sess-3"));
    const got = await new PrismaSessionStore().get("sess-3");
    expect(got?.id).toBe("sess-3");
    expect(got?.questionIds).toEqual(["air-law-0001", "navigation-0002"]);
  });
});
