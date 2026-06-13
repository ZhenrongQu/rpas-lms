import { describe, expect, it } from "vitest";
import { dbLessonToMeta } from "./dbMappers";

const baseRow = {
  lessonId: "basic/air-law/intro",
  course: "basic",
  moduleId: "air-law",
  slug: "intro",
  titleEN: "Intro",
  titleZH: "介绍",
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  bodyEN: "",
  bodyZH: "",
};

describe("dbLessonToMeta — video fields", () => {
  it("passes video fields through when present", () => {
    const meta = dbLessonToMeta(
      { ...baseRow, videoUid: "abc123", videoStatus: "READY", videoDurationSec: 600, videoThumbnailUrl: "https://t/x.jpg" },
      "en",
    );
    expect(meta.videoUid).toBe("abc123");
    expect(meta.videoStatus).toBe("READY");
    expect(meta.videoDurationSec).toBe(600);
    expect(meta.videoThumbnailUrl).toBe("https://t/x.jpg");
  });

  it("yields null video fields for a text-only lesson", () => {
    const meta = dbLessonToMeta(
      { ...baseRow, videoUid: null, videoStatus: null, videoDurationSec: null, videoThumbnailUrl: null },
      "zh",
    );
    expect(meta.videoUid).toBeNull();
    expect(meta.title).toBe("介绍");
  });
});
