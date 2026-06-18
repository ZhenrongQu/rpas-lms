import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { prisma } from "../../../../src/lib/db";

// Seeded by scripts/seed-content.ts (globalSetup); progress FKs to a real lesson.
const LESSON = "basic/air-law/intro-1";
const USER = "sec03-progress-user";

function postReq(userId: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-test-user-id"] = userId;
  return new Request("http://test/api/progress/lesson", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  await prisma.basicLessonProgress.deleteMany({ where: { userId: USER } });
  await prisma.customer.deleteMany({ where: { id: USER } });
}

describe("POST /api/progress/lesson", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.customer.create({
      data: { id: USER, email: "sec03@test.dev", displayName: "Sec03" },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("401 without an authenticated user", async () => {
    expect((await POST(postReq(null, { lessonId: LESSON }))).status).toBe(401);
  });

  it("400 for an invalid body", async () => {
    expect((await POST(postReq(USER, {}))).status).toBe(400);
  });

  it("SEC-03: 404 for a lessonId that does not exist, and writes nothing", async () => {
    const res = await POST(postReq(USER, { lessonId: "basic/air-law/nope-sec03" }));
    expect(res.status).toBe(404);
    expect(await prisma.basicLessonProgress.findFirst({ where: { userId: USER } })).toBeNull();
  });

  it("200 and records progress for a real lesson", async () => {
    const res = await POST(postReq(USER, { lessonId: LESSON }));
    expect(res.status).toBe(200);
    expect(
      await prisma.basicLessonProgress.findUnique({
        where: { userId_lessonId: { userId: USER, lessonId: LESSON } },
      }),
    ).not.toBeNull();
  });
});
