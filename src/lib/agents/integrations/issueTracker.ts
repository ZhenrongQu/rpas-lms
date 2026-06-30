import { prisma } from "../../db";
import { assignOwner } from "../sdlc/team";

/**
 * Pluggable issue-tracker integration. MockIssueTracker is the sandbox
 * implementation (writes MockTicket rows, auto-assigns via the roster, logs the
 * payload a real Jira call would send). JiraIssueTracker is the same-interface
 * stub: swapping the real one in later is a config change, not an engine change.
 */

export type NewTicket = { title: string; body: string; area: string; runId?: string };
export type Ticket = { key: string; title: string; assignee: string; area: string };

export interface IssueTracker {
  create(t: NewTicket): Promise<Ticket>;
}

export class MockIssueTracker implements IssueTracker {
  async create(t: NewTicket): Promise<Ticket> {
    const assignee = assignOwner(t.area);
    const key = `SDLC-${(await prisma.mockTicket.count()) + 1}`;
    await prisma.mockTicket.create({
      data: {
        key,
        runId: t.runId ?? null,
        title: t.title,
        body: t.body,
        area: t.area,
        assignee,
      },
    });
    // In live mode this is where we'd POST to the real Jira API.
    console.log(`   📋 ${key} → ${assignee}   ${t.title}`);
    return { key, title: t.title, assignee, area: t.area };
  }
}

/** Stub for the real integration — identical interface, swapped in by config. */
export class JiraIssueTracker implements IssueTracker {
  create(_t: NewTicket): Promise<Ticket> {
    throw new Error("JiraIssueTracker not implemented — use the mock in sandbox mode.");
  }
}
