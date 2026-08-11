/**
 * Input-side scope gate — the hard boundary the system prompt cannot be.
 *
 * The system prompt asks the assistant to steer off-topic questions back to the
 * course, but a prompt is a soft constraint: the model can answer "what's the
 * weather in Vancouver" from parametric knowledge without ever calling a tool, so
 * the retrieval distance cutoff never gets a chance to apply. A refusal has to be
 * a code path, not an instruction.
 *
 * The check reuses the retrieval stack rather than adding a classifier: embed the
 * incoming message and ask pgvector for the single nearest chunk in the corpus. If
 * even the nearest one is beyond a distance cutoff, nothing here covers the topic.
 * That is one embedding call plus one indexed lookup, spent before any Anthropic
 * tokens — so on off-topic traffic the gate is a cost saving, not just a guardrail.
 *
 * Two deliberate inversions of the retrieval path:
 *
 *  - **Fails OPEN.** The remediation agent fails closed to NEEDS_HUMAN because a
 *    wrong code change is expensive and hard to undo. Here the asymmetry runs the
 *    other way: this gate stands in front of a PAID feature, and wrongly refusing
 *    a student who paid costs far more than occasionally answering something
 *    off-topic. Every uncertainty — no Voyage key, an embed failure, a DB fault, an
 *    unembedded corpus — admits the request.
 *
 *  - **No locale or certLevel filter.** Retrieval scopes to the reply language;
 *    this gate answers a different question ("does the corpus cover this at all?").
 *    Embeddings are cross-lingual, so a Chinese question may legitimately be
 *    nearest an English chunk. Searching the whole corpus makes the gate more
 *    permissive — the direction its errors should lean.
 *
 * OFF BY DEFAULT: with SCOPE_MAX_COSINE_DISTANCE unset the gate admits everything.
 * The cutoff has not been calibrated against real Voyage distances, and shipping an
 * uncalibrated refusal in front of paying users is an experiment run on customers.
 * `checkScope` logs the observed distance on admits too, which is how the
 * distribution needed to pick a cutoff gets collected in the first place.
 */
import { prisma } from "../../../db";
import { embedQuery } from "./embed";

export type ScopeVerdict =
  | { inScope: true; reason: "matched"; distance: number }
  | { inScope: true; reason: "gate_disabled" | "gate_unavailable" | "corpus_empty" }
  | { inScope: false; distance: number };

/** Longest probe text sent to the embedder, taken from the END of the turns so the
 *  newest message always survives. */
const PROBE_MAX_CHARS = 600;

/** The cutoff, or `null` meaning "gate off, admit everything". Unset, blank, or
 *  out-of-range all disable it — a malformed value must not silently become a
 *  refusal policy. */
export function scopeMaxDistance(raw = process.env.SCOPE_MAX_COSINE_DISTANCE): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : null;
}

/** Build the text the gate judges.
 *
 *  A bare follow-up ("why?", "再详细点") carries no topic of its own and would look
 *  off-corpus on its own, so the previous user turn is prepended as an anchor: a
 *  conversation that started in scope stays in scope unless the new message pulls
 *  it out. Only user turns are used — the assistant's own words would let a
 *  successful topic drift justify the next one. */
export function buildScopeProbe(messages: { role: string; content: string }[]): string {
  const probe = messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.content)
    .join("\n")
    .trim();
  return probe.length > PROBE_MAX_CHARS ? probe.slice(-PROBE_MAX_CHARS) : probe;
}

/** Decide whether a message is within the corpus's subject matter. Never throws:
 *  every failure path admits (see the fail-open note above). */
export async function checkScope(probe: string): Promise<ScopeVerdict> {
  const threshold = scopeMaxDistance();
  if (threshold === null) return { inScope: true, reason: "gate_disabled" };
  if (!probe.trim()) return { inScope: true, reason: "gate_unavailable" };

  try {
    const vec = await embedQuery(probe);
    if (!vec) return { inScope: true, reason: "gate_unavailable" };

    const literal = `[${vec.join(",")}]`;
    // Nearest neighbour over the WHOLE embedded corpus — no locale/cert filter.
    const rows = await prisma.$queryRaw<{ distance: number }[]>`
      SELECT embedding <=> ${literal}::vector AS distance
      FROM "KnowledgeChunk"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 1`;

    const distance = Number(rows[0]?.distance);
    // No embedded chunks yet (fresh install, or a keyword-only index) — the gate
    // has nothing to judge against, so it must not judge.
    if (!Number.isFinite(distance)) return { inScope: true, reason: "corpus_empty" };

    // Logged on admits too: without the in-scope distances there is no distribution
    // to calibrate the cutoff from, and an uncalibrated cutoff is why this gate
    // ships disabled.
    console.info(`[scope] distance=${distance.toFixed(4)} threshold=${threshold}`);

    return distance <= threshold
      ? { inScope: true, reason: "matched", distance }
      : { inScope: false, distance };
  } catch (err) {
    console.error(
      `[scope] gate failed, admitting: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { inScope: true, reason: "gate_unavailable" };
  }
}

/** What an out-of-scope student is told. Deliberately generic: naming the thing
 *  they asked about ("I can't help with weather") reads as an invitation to
 *  rephrase around the gate. */
export function scopeRefusal(locale: "EN" | "ZH"): string {
  return locale === "ZH"
    ? "我是这门 RPAS（无人机）课程的学习助教，只能回答课程内容、法规和考试相关的问题。\n\n" +
        "换个和学习有关的问题问我吧 —— 比如某个模块的知识点、某条法规，或者你的模考成绩该怎么提高。"
    : "I'm the study assistant for this RPAS (drone) training course, so I can only help with " +
        "course material, regulations, and exam topics.\n\n" +
        "Ask me something about your studies — a module, a regulation, or how to improve your " +
        "mock-exam results.";
}
