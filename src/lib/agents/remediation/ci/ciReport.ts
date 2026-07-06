import { basename } from "node:path";
import type { VitestIncident } from "../real/vitestSubstrate";

export type CiFailure = { signature: VitestIncident; relatedTests: string[] };

type VitestJson = {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{ fullName?: string; title?: string; status?: string; failureMessages?: string[] }>;
  }>;
};

/** First token of a (de-ANSI'd) failure message is the error class, e.g. "AssertionError". */
function errorNameOf(msg: string | undefined): string {
  if (!msg) return "Error";
  const clean = msg.replace(/\[[0-9;]*m/g, "");
  const m = clean.match(/^\s*([A-Za-z][\w$]*):/);
  return m ? m[1]! : "Error";
}

/** Repo-relative path from an absolute vitest `name`, best-effort: strip everything up to
 *  and including the last `src/` segment so the signature matches the fixture's rel paths. */
function relPath(absName: string): string {
  const i = absName.lastIndexOf("/src/");
  return i >= 0 ? absName.slice(i + 1) : basename(absName);
}

/** Parse a vitest `--reporter=json` report → the FIRST failing test's signature + its file
 *  as the single related test. Returns null for a green/empty/unparseable report. */
export function parseCiReport(json: string): CiFailure | null {
  let p: VitestJson;
  try {
    p = JSON.parse(json) as VitestJson;
  } catch {
    return null;
  }
  for (const file of p.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const testFile = relPath(file.name ?? "");
      return {
        signature: { testFile, testName: a.title ?? a.fullName ?? "", errorName: errorNameOf(a.failureMessages?.[0]) },
        relatedTests: [testFile],
      };
    }
  }
  return null;
}
