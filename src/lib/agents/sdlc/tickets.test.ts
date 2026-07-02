import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../../db";
import { MockIssueTracker } from "../integrations/issueTracker";
import { TicketFiler } from "./tickets";

const RUN = "test-ticketfiler";

afterEach(async () => {
  await prisma.mockTicket.deleteMany({ where: { runId: RUN } });
});

describe("TicketFiler", () => {
  it("wipes a prior attempt's tickets on forRun (replay-safety)", async () => {
    // Simulate a crashed prior attempt that already filed two tickets for this run.
    const tracker = new MockIssueTracker();
    await tracker.create({ title: "t1", body: "b", area: "src/lib/exam", runId: RUN });
    await tracker.create({ title: "t2", body: "b", area: "src/lib/exam", runId: RUN });
    expect(await prisma.mockTicket.count({ where: { runId: RUN } })).toBe(2);

    await TicketFiler.forRun(RUN); // the stage re-running after the crash
    expect(await prisma.mockTicket.count({ where: { runId: RUN } })).toBe(0);
  });

  it("dedupes an identical (area+title) call within one run", async () => {
    const filer = await TicketFiler.forRun(RUN);
    await filer.file({ title: "fix scoreExam", body: "b", area: "src/lib/exam" });
    const second = await filer.file({ title: "fix scoreExam", body: "b", area: "src/lib/exam" });
    expect(second).toMatch(/duplicate/i);
    expect(filer.filed.length).toBe(1);
    expect(await prisma.mockTicket.count({ where: { runId: RUN } })).toBe(1);
  });

  it("rejects invalid tool input without filing a ticket", async () => {
    const filer = await TicketFiler.forRun(RUN);
    const r = await filer.file({ title: "", area: "src/lib/exam" }); // empty title, missing body
    expect(r).toMatch(/invalid/i);
    expect(await prisma.mockTicket.count({ where: { runId: RUN } })).toBe(0);
  });
});
