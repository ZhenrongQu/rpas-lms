/**
 * Minimal .env loader (no dotenv dependency). Imported FIRST in run.ts so that
 * DATABASE_URL and ANTHROPIC_API_KEY are present before Prisma / the Anthropic
 * client are constructed. Only sets keys that aren't already in the environment.
 */
import { readFileSync } from "node:fs";

try {
  const text = readFileSync(new URL("../../.env", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // No .env (e.g. CI with real env vars) — that's fine.
}
