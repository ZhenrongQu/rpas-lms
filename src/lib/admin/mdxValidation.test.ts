import { describe, it, expect } from "vitest";
import { validateLessonMdxBodies } from "./mdxValidation";

const prose = (extra: string) =>
  `Intro prose for the lesson.\n\n<Tip>Watch out.</Tip>\n\n## Heading\n\n${extra}\n`;

describe("validateLessonMdxBodies", () => {
  it("accepts prose with whitelisted components", async () => {
    expect(
      await validateLessonMdxBodies({ bodyEN: prose("Body text."), bodyZH: prose("正文。") }),
    ).toEqual({ ok: true });
  });

  it("accepts an empty body (video-only lesson)", async () => {
    expect(await validateLessonMdxBodies({ bodyEN: "", bodyZH: "" })).toEqual({ ok: true });
  });

  it("rejects invalid MDX syntax", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: "Drone under <5 m altitude",
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.startsWith("EN: invalid MDX"))).toBe(true);
  });

  it("rejects an unknown capitalized component", async () => {
    const res = await validateLessonMdxBodies({ bodyEN: prose("<Foo />"), bodyZH: prose("正文。") });
    expect(res.ok).toBe(false);
  });

  it("rejects the removed inline <Checkpoint> tag as unknown (SEC-04)", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: prose('<Checkpoint questionId="cp-air-law-0001" />'),
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("<Checkpoint>"))).toBe(true);
  });

  it("rejects import/export statements", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: `import x from "y"\n\n${prose("Body.")}`,
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("import/export"))).toBe(true);
  });

  it("rejects dangerous raw HTML via the allowlist (SEC-17)", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: prose("<script>alert(1)</script>"),
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("disallowed tag <script>"))).toBe(true);
  });

  it("rejects a non-whitelisted HTML tag like <iframe> (SEC-17)", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: prose('<iframe src="https://evil.test"></iframe>'),
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("disallowed tag <iframe>"))).toBe(true);
  });

  it("rejects a dangerous attribute on an allowed tag (SEC-17)", async () => {
    const res = await validateLessonMdxBodies({
      bodyEN: prose('<img src="x" onerror="alert(1)" />'),
      bodyZH: prose("正文。"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("on*="))).toBe(true);
  });

  it("accepts safe whitelisted raw HTML (SEC-17)", async () => {
    expect(
      await validateLessonMdxBodies({
        bodyEN: prose("Press <kbd>Esc</kbd> then a <br/> line and <sub>x</sub>."),
        bodyZH: prose("正文。"),
      }),
    ).toEqual({ ok: true });
  });

  it("does not false-positive on `<...>` inside inline code (SEC-17)", async () => {
    expect(
      await validateLessonMdxBodies({
        bodyEN: prose("Use the path `media/<moduleId>/<id>.<ext>` for assets."),
        bodyZH: prose("正文。"),
      }),
    ).toEqual({ ok: true });
  });
});
