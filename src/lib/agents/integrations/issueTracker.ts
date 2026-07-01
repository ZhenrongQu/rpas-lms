import { Prisma } from "@prisma/client";
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

const MAX_KEY_ATTEMPTS = 25;

export class MockIssueTracker implements IssueTracker {
  async create(t: NewTicket): Promise<Ticket> {
    const assignee = assignOwner(t.area);

    // Key allocation must tolerate concurrent creates and deletion gaps. We start
    // from max(suffix)+1 — hole-immune, unlike count()+1, which a large block of
    // deletions below a contiguous run could push back into occupied keys — and on
    // a unique-constraint clash (a concurrent create grabbed it) we bump and retry.
    const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(key FROM 6) AS INTEGER)) AS max FROM "MockTicket"
    `;
    const base = (max ?? 0) + 1;
    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
      const key = `SDLC-${base + attempt}`;
      try {
        await prisma.mockTicket.create({
          data: { key, runId: t.runId ?? null, title: t.title, body: t.body, area: t.area, assignee },
        });
        // In live mode this is where we'd POST to the real Jira API.
        console.log(`   📋 ${key} → ${assignee}   ${t.title}`);
        return { key, title: t.title, assignee, area: t.area };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
    throw new Error("could not allocate a unique ticket key after retries");
  }
}

/** Stub for the real integration — identical interface, swapped in by config. */
export class JiraIssueTracker implements IssueTracker {
  create(_t: NewTicket): Promise<Ticket> {
    throw new Error("JiraIssueTracker not implemented — use the mock in sandbox mode.");
  }
}
