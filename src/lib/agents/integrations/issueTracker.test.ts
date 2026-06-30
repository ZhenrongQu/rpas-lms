import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../../db";
import { MockIssueTracker } from "./issueTracker";

const RUN = "test-issuetracker";
const tracker = new MockIssueTracker();

afterEach(async () => {
  await prisma.mockTicket.deleteMany({ where: { runId: RUN } });
});

describe("MockIssueTracker", () => {
  it("allocates unique keys under concurrent creates (retry-on-collision)", async () => {
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        tracker.create({ title: `task ${i}`, body: "b", area: "src/lib/exam", runId: RUN }),
      ),
    );
    const keys = created.map((c) => c.key);
    expect(new Set(keys).size).toBe(6); // no duplicate keys
  });

  it("routes the assignee by area", async () => {
    const t = await tracker.create({ title: "x", body: "b", area: "src/lib/payments", runId: RUN });
    expect(t.assignee).toContain("priya");
  });
});
