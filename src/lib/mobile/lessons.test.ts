import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeMobileLesson,
  getMobileCourses,
  getMobileLesson,
  mdxToMobileBlocks,
} from "./lessons";
import {
  getCourseLessonCount,
  getCourseModules,
  getLesson,
  getModuleLessons,
} from "../lessons/catalog";
import {
  lessonExists,
  listCompletedLessonIds,
  markLessonComplete,
} from "../lessons/progress";

vi.mock("../lessons/catalog", () => ({
  getCourseLessonCount: vi.fn(),
  getCourseModules: vi.fn(),
  getLesson: vi.fn(),
  getModuleLessons: vi.fn(),
}));

vi.mock("../lessons/progress", () => ({
  lessonExists: vi.fn(),
  listCompletedLessonIds: vi.fn(),
  markLessonComplete: vi.fn(),
}));

describe("mdxToMobileBlocks", () => {
  it("projects the supported MDX subset into mobile blocks", () => {
    expect(
      mdxToMobileBlocks(`# Title

Paragraph one.

## Section

- First
- Second

<Callout type="tip">Remember the rule.</Callout>
`),
    ).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Paragraph one." },
      { type: "heading", level: 2, text: "Section" },
      { type: "list", ordered: false, items: ["First", "Second"] },
      { type: "callout", tone: "tip", text: "Remember the rule." },
    ]);
  });

  it("keeps ordered lists ordered", () => {
    expect(
      mdxToMobileBlocks(`1. First
2. Second
`),
    ).toEqual([{ type: "list", ordered: true, items: ["First", "Second"] }]);
  });

  it("flushes when list kind changes", () => {
    expect(
      mdxToMobileBlocks(`- First
- Second
1. Third
2. Fourth
`),
    ).toEqual([
      { type: "list", ordered: false, items: ["First", "Second"] },
      { type: "list", ordered: true, items: ["Third", "Fourth"] },
    ]);
  });
});

describe("getMobileCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCompletedLessonIds).mockResolvedValue([]);
    vi.mocked(getCourseModules).mockResolvedValue([]);
    vi.mocked(getCourseLessonCount).mockResolvedValue(0);
    vi.mocked(getModuleLessons).mockResolvedValue([]);
  });

  it("aggregates course counts, modules, and lock state", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue([
      "basic/mod-1/intro",
      "advanced/mod-2/solo",
    ]);
    vi.mocked(getCourseModules)
      .mockResolvedValueOnce(["mod-1"])
      .mockResolvedValueOnce(["mod-2"]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    vi.mocked(getModuleLessons)
      .mockResolvedValueOnce([
        {
          lessonId: "basic/mod-1/intro",
          course: "basic",
          moduleId: "mod-1",
          slug: "intro",
          title: "Intro",
          order: 1,
          estMinutes: 5,
          certLevel: "BASIC",
          access: "FREE",
          videoUid: null,
          videoStatus: null,
          videoDurationSec: null,
          videoThumbnailUrl: null,
        },
        {
          lessonId: "basic/mod-1/rules",
          course: "basic",
          moduleId: "mod-1",
          slug: "rules",
          title: "Rules",
          order: 2,
          estMinutes: 7,
          certLevel: "BASIC",
          access: "FREE",
          videoUid: null,
          videoStatus: null,
          videoDurationSec: null,
          videoThumbnailUrl: null,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          lessonId: "advanced/mod-2/solo",
          course: "advanced",
          moduleId: "mod-2",
          slug: "solo",
          title: "Solo",
          order: 1,
          estMinutes: 8,
          certLevel: "ADVANCED",
          access: "PAID",
          videoUid: null,
          videoStatus: null,
          videoDurationSec: null,
          videoThumbnailUrl: null,
        },
      ] as never);

    await expect(
      getMobileCourses({
        userId: "user_1",
        locale: "en",
        accessTier: "FREE",
      }),
    ).resolves.toEqual([
      {
        course: "basic",
        title: "Basic",
        locked: false,
        done: 1,
        total: 2,
        modules: [
          {
            moduleId: "mod-1",
            lessons: [
              expect.objectContaining({ lessonId: "basic/mod-1/intro", completed: true }),
              expect.objectContaining({ lessonId: "basic/mod-1/rules", completed: false }),
            ],
          },
        ],
      },
      {
        course: "advanced",
        title: "Advanced",
        locked: true,
        done: 1,
        total: 3,
        modules: [
          {
            moduleId: "mod-2",
            lessons: [expect.objectContaining({ lessonId: "advanced/mod-2/solo", completed: true })],
          },
        ],
      },
    ]);
  });
});

describe("getMobileLesson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCompletedLessonIds).mockResolvedValue([]);
    vi.mocked(getLesson).mockResolvedValue(null);
  });

  it("rejects invalid lesson ids including extra segments", async () => {
    await expect(
      getMobileLesson({
        userId: "user_1",
        lessonId: "basic/mod",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toBeNull();

    await expect(
      getMobileLesson({
        userId: "user_1",
        lessonId: "basic/mod/slug/extra",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toBeNull();

    expect(getLesson).not.toHaveBeenCalled();
  });

  it("blocks advanced lessons for non-paid users", async () => {
    await expect(
      getMobileLesson({
        userId: "user_1",
        lessonId: "advanced/mod/slug",
        locale: "en",
        accessTier: "FREE",
      }),
    ).resolves.toEqual({ locked: true });

    expect(getLesson).not.toHaveBeenCalled();
  });

  it("returns null for missing lessons", async () => {
    await expect(
      getMobileLesson({
        userId: "user_1",
        lessonId: "basic/mod/slug",
        locale: "en",
        accessTier: "PAID",
      }),
    ).resolves.toBeNull();

    expect(getLesson).toHaveBeenCalledWith("en", "basic", "mod", "slug");
  });
});

describe("completeMobileLesson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_found when the lesson does not exist", async () => {
    vi.mocked(lessonExists).mockResolvedValue(false);

    await expect(completeMobileLesson("user_1", "basic/mod/missing")).resolves.toBe("not_found");
    expect(markLessonComplete).not.toHaveBeenCalled();
  });
});
