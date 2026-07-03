/**
 * Disabled graded repair eval.
 *
 * The legacy catalog uses exit-code-only Node checks, which cannot prove that an
 * untrusted repair actually ran the assertions (`process.exit(0)` can fake green).
 * Keep this command as an explicit, side-effect-free redirect until the catalog is
 * migrated to the report-proof Vitest substrate.
 */
console.error(
  "eval:repair is disabled (exit-code-only catalog cannot prove a check ran → false-green risk). " +
    "Use `pnpm real-repair-eval` (real Vitest + Docker + report-proof).",
);
process.exitCode = 1;
