import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as coursesGet } from "../courses/route";
import { GET as lessonGet } from "./[lessonId]/route";
import { POST as progressPost } from "../progress/lesson/route";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import {
  completeMobileLesson,
  getMobileCourses,
  getMobileLesson,
} from "../../../../src/lib/mobile/lessons";

vi.mock("../../../../src/lib/mobile/account", () => ({
  requireMobileAccount: vi.fn(),
}));

vi.mock("../../../../src/lib/mobile/lessons", () => ({
  getMobileCourses: vi.fn(),
  getMobileLesson: vi.fn(),
  completeMobileLesson: vi.fn(),
}));

describe("mobile lesson routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated courses requests", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    });

    const res = await coursesGet(new Request("http://test/api/mobile/courses"));

    expect(getMobileCourses).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("returns courses for the authenticated user", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "PAID",
      },
    });
    vi.mocked(getMobileCourses).mockResolvedValue([{ course: "basic", modules: [] }] as never);

    const res = await coursesGet(new Request("http://test/api/mobile/courses?locale=zh"));

    expect(getMobileCourses).toHaveBeenCalledWith({
      userId: "user_1",
      locale: "zh",
      accessTier: "PAID",
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      courses: [{ course: "basic", modules: [] }],
    });
  });

  it("returns 401 for unauthenticated lesson requests", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    });

    const res = await lessonGet(new Request("http://test/api/mobile/lessons/basic%2Fmod%2Fslug"), {
      params: Promise.resolve({ lessonId: "basic%2Fmod%2Fslug" }),
    });

    expect(getMobileLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("returns invalid lesson id for malformed encoding", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });

    const res = await lessonGet(new Request("http://test/api/mobile/lessons/%E0%A4%A"), {
      params: Promise.resolve({ lessonId: "%E0%A4%A" }),
    });

    expect(getMobileLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid lesson id" });
  });

  it("returns lesson not found when the service returns null", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
    vi.mocked(getMobileLesson).mockResolvedValue(null);

    const res = await lessonGet(new Request("http://test/api/mobile/lessons/basic%2Fmod%2Fslug"), {
      params: Promise.resolve({ lessonId: "basic%2Fmod%2Fslug" }),
    });

    expect(getMobileLesson).toHaveBeenCalledWith({
      userId: "user_1",
      lessonId: "basic/mod/slug",
      locale: "en",
      accessTier: "FREE",
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "lesson not found" });
  });

  it("returns upgrade required for a locked lesson", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
    vi.mocked(getMobileLesson).mockResolvedValue({ locked: true } as never);

    const res = await lessonGet(new Request("http://test/api/mobile/lessons/advanced%2Fmod%2Fslug"), {
      params: Promise.resolve({ lessonId: "advanced%2Fmod%2Fslug" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "upgrade required" });
  });

  it("returns the projected mobile lesson when available", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "PAID",
      },
    });
    vi.mocked(getMobileLesson).mockResolvedValue({
      locked: false,
      meta: { lessonId: "advanced/mod/slug", title: "Briefing" },
      completed: true,
      blocks: [{ type: "paragraph", text: "Body" }],
    } as never);

    const res = await lessonGet(new Request("http://test/api/mobile/lessons/advanced%2Fmod%2Fslug?locale=zh"), {
      params: Promise.resolve({ lessonId: "advanced%2Fmod%2Fslug" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      locked: false,
      meta: { lessonId: "advanced/mod/slug", title: "Briefing" },
      completed: true,
      blocks: [{ type: "paragraph", text: "Body" }],
    });
  });

  it("returns 401 for unauthenticated progress requests", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    });

    const res = await progressPost(
      new Request("http://test/api/mobile/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: "basic/mod/slug" }),
      }),
    );

    expect(completeMobileLesson).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("rejects malformed JSON when recording lesson progress", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });

    const res = await progressPost(
      new Request("http://test/api/mobile/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    expect(completeMobileLesson).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: "invalid JSON" });
  });

  it("rejects invalid progress bodies", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });

    const res = await progressPost(
      new Request("http://test/api/mobile/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: "" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(completeMobileLesson).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: "invalid body" });
  });

  it("returns not found when completing an unknown lesson", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
    vi.mocked(completeMobileLesson).mockResolvedValue("not_found");

    const res = await progressPost(
      new Request("http://test/api/mobile/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: "basic/mod/slug" }),
      }),
    );

    expect(completeMobileLesson).toHaveBeenCalledWith("user_1", "basic/mod/slug");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "lesson not found" });
  });

  it("records lesson progress for a valid request", async () => {
    vi.mocked(requireMobileAccount).mockResolvedValue({
      ok: true,
      account: {
        userId: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
    vi.mocked(completeMobileLesson).mockResolvedValue("ok");

    const res = await progressPost(
      new Request("http://test/api/mobile/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: "basic/mod/slug" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
