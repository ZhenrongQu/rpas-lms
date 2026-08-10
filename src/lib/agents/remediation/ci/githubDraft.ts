import { prisma } from "../../../db";
import type { GitHubClient, OpenPr, PrTarget } from "./githubClient";

const KIND = "draft_pr";
const LABELS = ["automated-remediation", "needs-human-review"];

/**
 * Mirror a run's kernel-written `needs_review` draft (the latest ExternalActionVersion for the
 * incident) to a REAL GitHub draft PR. Idempotent per incident: an existing open PR for the
 * head branch is updated (branch force-pushed), never duplicated. Returns null when no
 * needs_review draft exists (a non-green outcome produced no artifact).
 */
export class DraftPublisher {
  constructor(private readonly gh: GitHubClient) {}

  async publish(args: { incidentId: string; target: PrTarget }): Promise<OpenPr | null> {
    const action = await prisma.externalAction.findFirst({
      where: { incidentId: args.incidentId, kind: KIND, status: "needs_review" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const version = action?.versions[0];
    if (!action || !version) return null;

    const message = `remediation: ${version.body}`.slice(0, 72);
    await this.gh.pushFixBranch({ headBranch: args.target.headBranch, baseCommit: args.target.baseRef, patch: version.patch, message });

    const existing = await this.gh.findOpenPr(args.target.headBranch);
    if (existing) return existing; // branch updated above; PR already open

    return this.gh.openDraftPr({
      target: args.target,
      title: `[auto-remediation] ${version.body}`.slice(0, 120),
      body: version.evidence
        ? `Automated fix candidate — **needs human review, not auto-merged**.\n\n\`\`\`json\n${version.evidence}\n\`\`\``
        : version.body,
      labels: LABELS,
    });
  }
}
