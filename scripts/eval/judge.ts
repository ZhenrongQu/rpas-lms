/**
 * LLM-as-judge: scores a free-text answer against a rubric, returning a
 * structured verdict. Deterministic properties (tool calls, forbidden strings)
 * are checked in code by the runner — the judge only grades the fuzzy quality
 * dimensions the rubric describes.
 *
 * Caveat worth knowing as an AI engineer: judging Opus with Opus risks a mild
 * self-preference bias. For a higher-stakes eval, judge with a different model
 * family and/or add a second judge and take the consensus.
 */
import Anthropic from "@anthropic-ai/sdk";

export type Judgement = { pass: boolean; score: number; reason: string };

// Structured output schema — guarantees parseable JSON back from the judge.
const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    score: { type: "integer" }, // 1 (poor) … 5 (excellent)
    reason: { type: "string" },
  },
  required: ["pass", "score", "reason"],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function judge(question: string, answer: string, rubric: string): Promise<Judgement> {
  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system:
      "You grade an AI study assistant's answer against a rubric for an RPAS (drone) pilot training " +
      "platform. Be strict and objective. Set pass=true only if the answer satisfies the rubric. " +
      "score is 1 (poor) to 5 (excellent).",
    output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `[STUDENT QUESTION]\n${question}\n\n[ASSISTANT ANSWER]\n${answer || "(empty)"}\n\n[PASS CRITERIA]\n${rubric}`,
      },
    ],
  });

  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
  try {
    const parsed = JSON.parse(text) as Judgement;
    return parsed;
  } catch {
    return { pass: false, score: 1, reason: "judge returned unparseable output" };
  }
}
