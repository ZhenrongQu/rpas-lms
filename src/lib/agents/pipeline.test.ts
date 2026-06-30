import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "../db";
import { registerPipeline, startRun, applyDecision, resumeRun, getRun, type Stage } from "./pipeline";

// Stub stages — no LLM. They record the order they ran so tests can assert the
// engine drove them correctly. A/B are gated, C is not.
const KIND = "test-sdlc";
const calls: string[] = [];
const stub: Stage[] = [
  { name: "A", requiresApproval: true, run: async (ctx) => { calls.push("A"); return { text: `A:${ctx.input}`, tokens: 1 }; } },
  { name: "B", requiresApproval: true, run: async () => { calls.push("B"); return { text: "B", tokens: 1 }; } },
  { name: "C", requiresApproval: false, run: async () => { calls.push("C"); return { text: "C", tokens: 1 }; } },
];

beforeAll(() => registerPipeline(KIND, stub));
afterEach(async () => {
  calls.length = 0;
  await prisma.agentRun.deleteMany({ where: { kind: KIND } });
});

describe("pipeline gate state machine", () => {
  it("stops at each gate, then advances to done", async () => {
    const id = await startRun(KIND, "idea");
    let run = await getRun(id);
    expect(run?.status).toBe("awaiting_approval");
    expect(run?.currentStage).toBe("A");
    expect(JSON.parse(run!.artifacts).A).toBe("A:idea");

    await applyDecision(id, "approve");
    run = await getRun(id);
    expect(run?.status).toBe("awaiting_approval");
    expect(run?.currentStage).toBe("B");

    await applyDecision(id, "approve"); // B gated, C not → runs to done
    run = await getRun(id);
    expect(run?.status).toBe("done");
    expect(run?.currentStage).toBeNull();
    expect(JSON.parse(run!.artifacts).C).toBe("C");
    expect(calls).toEqual(["A", "B", "C"]);
  });

  it("reject stops the run before the next stage", async () => {
    const id = await startRun(KIND, "idea");
    await applyDecision(id, "reject", "nope");
    const run = await getRun(id);
    expect(run?.status).toBe("rejected");
    expect(calls).toEqual(["A"]); // B never ran
  });

  it("refuses a decision when not awaiting approval", async () => {
    const id = await startRun(KIND, "idea");
    await applyDecision(id, "reject");
    await expect(applyDecision(id, "approve")).rejects.toThrow();
  });

  it("concurrent approves: exactly one wins (atomic gate)", async () => {
    const id = await startRun(KIND, "idea"); // gated at A
    const results = await Promise.allSettled([
      applyDecision(id, "approve"),
      applyDecision(id, "approve"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const run = await getRun(id);
    expect(run?.currentStage).toBe("B"); // advanced exactly once
    expect(calls.filter((c) => c === "B").length).toBe(1); // B ran once, not twice
  });

  it("resume completes a run left stuck in running by a crash", async () => {
    // Simulate a crash after stage A but before the state flip.
    const crashed = await prisma.agentRun.create({
      data: { kind: KIND, input: "idea", status: "running", artifacts: JSON.stringify({ A: "A:idea" }) },
    });
    await resumeRun(crashed.id);
    const run = await getRun(crashed.id);
    expect(run?.status).toBe("awaiting_approval");
    expect(run?.currentStage).toBe("B"); // resumed at the next missing stage
    expect(calls).toEqual(["B"]); // only B re-ran; A was not redone
  });
});
