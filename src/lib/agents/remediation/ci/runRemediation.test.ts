import { describe, expect, it, vi } from "vitest";
import { runRemediation } from "./runRemediation";
import type { DefectSource } from "./defectSource";
import { MockGitHubClient } from "./githubClient";
import { DraftPublisher } from "./githubDraft";

const noRepairer = { repair: vi.fn() };
const publisher = new DraftPublisher(new MockGitHubClient());

describe("runRemediation", () => {
  it("short-circuits to no-defect when the source detects nothing", async () => {
    const source: DefectSource = { detect: async () => null };
    const r = await runRemediation(source, noRepairer, publisher, { target: { baseRef: "origin/main", headBranch: "x" } });
    expect(r).toEqual({ status: "no-defect", pr: null });
    expect(noRepairer.repair).not.toHaveBeenCalled();
  });
});
