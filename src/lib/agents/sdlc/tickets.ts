import { z } from "zod";
import { prisma } from "../../db";
import { MockIssueTracker, type IssueTracker } from "../integrations/issueTracker";

/**
 * Replay-safe, idempotent ticket filing for the TICKETS stage. The model controls
 * how many create_ticket calls it makes and with what content, so three guards sit
 * between the model and the side effect:
 *
 *  - validation: every tool input is zod-checked before it touches the tracker.
 *  - in-run dedupe: a repeated (area+title) call within one run is skipped, not refiled.
 *  - replay-safety: forRun() wipes any tickets a PRIOR attempt of this run filed, so a
 *    crash-resume that re-runs the whole stage can't double-file.
 */

export const CreateTicketSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  area: z.string().min(1),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export class TicketFiler {
  private readonly seen = new Set<string>();
  readonly filed: string[] = [];

  private constructor(
    private readonly runId: string,
    private readonly tracker: IssueTracker,
  ) {}

  /** Build a filer for a run, clearing tickets left by a previous attempt (replay-safety). */
  static async forRun(runId: string, tracker: IssueTracker = new MockIssueTracker()): Promise<TicketFiler> {
    await prisma.mockTicket.deleteMany({ where: { runId } });
    return new TicketFiler(runId, tracker);
  }

  /** Validate + dedupe + create one ticket. Returns the tool-result string for the model. */
  async file(input: unknown): Promise<string> {
    const parsed = CreateTicketSchema.safeParse(input);
    if (!parsed.success) {
      return `invalid create_ticket input: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
    }
    const { title, body, area } = parsed.data;
    const sig = `${area}::${title}`;
    if (this.seen.has(sig)) {
      return `duplicate ticket "${title}" (area ${area}) already filed in this run — skipped.`;
    }
    this.seen.add(sig);
    const t = await this.tracker.create({ title, body, area, runId: this.runId });
    this.filed.push(`${t.key} → ${t.assignee}  (${t.title})`);
    return `Created ${t.key}, assigned to ${t.assignee} (area: ${t.area}).`;
  }
}
