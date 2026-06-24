import { describe, expect, it } from "vitest";
import { mdxToMobileBlocks } from "./lessons";

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
});
