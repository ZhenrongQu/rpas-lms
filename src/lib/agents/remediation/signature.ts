import { basename } from "node:path";
import type { CheckResult, SignatureStrategy } from "./substrate";

/**
 * A normalized failure fingerprint (design §6). Deterministic and conservative:
 * error type plus the top application stack frames (module basename + symbol).
 * Never broadened to force a match.
 */
export type FailureSignature = {
  errorType: string;
  applicationFrames: Array<{ module: string; symbol?: string }>;
};

export type IncidentSignature = { errorType: string; sourceFile: string; symbol?: string };

const ERROR_LINE = /^(\w*Error): /m;
// `at <symbol> (<file>:line:col)` or `at <file>:line:col`. The file must be an
// absolute or file:// path, so `node:internal/...` frames never match (skipped).
const FRAME = /^\s+at (?:(\S.*?) \()?(file:\/\/\/[^\s:)]+|\/[^\s:)]+):\d+:\d+\)?/gm;

export function parseFailureSignature(stderr: string): FailureSignature | null {
  const err = stderr.match(ERROR_LINE);
  if (!err) return null;
  const applicationFrames: Array<{ module: string; symbol?: string }> = [];
  for (const m of stderr.matchAll(FRAME)) {
    const file = m[2]!.replace(/^file:\/\//, "");
    const module = basename(file);
    const symbol = m[1]?.trim();
    applicationFrames.push(symbol ? { module, symbol } : { module });
  }
  return { errorType: err[1]!, applicationFrames };
}

export function matchSignature(
  observed: FailureSignature,
  incident: IncidentSignature,
): "match" | "low-confidence" | "mismatch" {
  if (observed.errorType !== incident.errorType) return "mismatch";
  const top = observed.applicationFrames[0];
  if (!top) return "mismatch";
  if (top.module !== basename(incident.sourceFile)) return "mismatch";
  if (top.symbol && incident.symbol) return top.symbol === incident.symbol ? "match" : "mismatch";
  return "low-confidence"; // file matches, but a symbol is missing on one side
}

/** The default (script-fixture) signature strategy: a Node stack-trace fingerprint
 *  parsed from stderr, matched conservatively against the incident. */
export function nodeStackStrategy(incident: IncidentSignature): SignatureStrategy<FailureSignature> {
  return {
    parse: (result: CheckResult) => parseFailureSignature(result.stderr),
    match: (observed) => matchSignature(observed, incident),
    serialize: (observed) => JSON.stringify(observed),
  };
}
