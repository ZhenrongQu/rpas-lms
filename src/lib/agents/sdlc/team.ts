/**
 * Mock team roster — maps an affected path/area to its owning engineer,
 * CODEOWNERS-style. This is the seam where a real integration would instead look
 * up the owning team in Jira/GitHub. Longest matching prefix wins, so more
 * specific areas beat general ones.
 */

const ROSTER: { prefix: string; owner: string }[] = [
  { prefix: "src/lib/exam", owner: "elena (exam-platform)" },
  { prefix: "src/lib/payments", owner: "priya (payments)" },
  { prefix: "src/lib/chat", owner: "ada (ai-assistant)" },
  { prefix: "src/lib/agents", owner: "ada (ai-assistant)" },
  { prefix: "src/lib/flightReview", owner: "sam (flight-review)" },
  { prefix: "app/api/mobile", owner: "marco (mobile)" },
  { prefix: "mobile", owner: "marco (mobile)" },
  { prefix: "src/components", owner: "leo (frontend)" },
  { prefix: "app", owner: "leo (frontend)" },
  { prefix: "prisma", owner: "noah (platform)" },
];

const DEFAULT_OWNER = "triage (unassigned)";

export function assignOwner(area: string): string {
  const match = ROSTER.filter((r) => area.includes(r.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return match?.owner ?? DEFAULT_OWNER;
}
