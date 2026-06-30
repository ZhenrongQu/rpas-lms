/**
 * Sentry → triage runner (the reactive half of the SDLC loop). Polls the Sentry
 * source, and for each not-yet-triaged issue runs the triage agent and files a
 * mock ticket (skipping duplicates). Idempotent: an issue already recorded in
 * AgentRun.externalId is skipped, so re-running files nothing new.
 *
 *   pnpm triage        (needs ANTHROPIC_API_KEY; uses fixtures by default)
 */
import "../eval/loadEnv";
import { prisma } from "../../src/lib/db";
import { getSentrySource } from "../../src/lib/agents/triage/sentry";
import { runTriage } from "../../src/lib/agents/triage/triage";
import { recordStep } from "../../src/lib/agents/trace";
import { MockIssueTracker } from "../../src/lib/agents/integrations/issueTracker";

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add it to .env). The triage agent needs it.");
    process.exit(1);
  }

  const issues = await getSentrySource().unresolvedIssues();
  const tracker = new MockIssueTracker();
  console.log(`\n▶ Polling Sentry — ${issues.length} unresolved issue(s)\n`);

  let created = 0;
  let duplicate = 0;
  let skipped = 0;

  for (const issue of issues) {
    // Idempotency: an issue already triaged successfully is skipped. A previous
    // FAILED attempt is retried (reusing its row, since externalId is unique).
    const seen = await prisma.agentRun.findUnique({ where: { externalId: issue.id } });
    if (seen && seen.status !== "failed") {
      console.log(`⏭  ${issue.id}  already triaged (run ${seen.id}) — skipping`);
      skipped++;
      continue;
    }

    // Open tickets give the agent context to detect duplicates.
    const openTickets = await prisma.mockTicket.findMany({
      where: { status: "open" },
      select: { key: true, title: true, area: true },
    });

    const run = seen
      ? await prisma.agentRun.update({
          where: { id: seen.id },
          data: { status: "running", artifacts: "{}" },
        })
      : await prisma.agentRun.create({
          data: {
            kind: "sentry-triage",
            externalId: issue.id,
            input: JSON.stringify(issue),
            status: "running",
            artifacts: "{}",
          },
        });

    try {
      const { decision, tokens } = await runTriage(issue, openTickets);
      await recordStep(run.id, "triage", "stage", decision, tokens);

      if (decision.isDuplicate) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: "done", artifacts: JSON.stringify({ decision }) },
        });
        console.log(`🔁 ${issue.id}  [${decision.severity}] duplicate of ${decision.duplicateOf ?? "?"} — ${decision.summary}`);
        duplicate++;
      } else {
        const ticket = await tracker.create({
          title: `[${decision.severity}] ${decision.summary}`,
          body: `${decision.rationale}\n\nSuspected files:\n- ${decision.suspectedFiles.join("\n- ")}\n\nFrom Sentry ${issue.id}.`,
          area: decision.suggestedArea,
          runId: run.id,
        });
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: "done", artifacts: JSON.stringify({ decision, ticket: ticket.key }) },
        });
        created++;
      }
    } catch (e) {
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "failed" } });
      console.error(`✗ ${issue.id}  triage failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\nDone — ${created} ticket(s) filed, ${duplicate} duplicate(s), ${skipped} skipped (already triaged).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
