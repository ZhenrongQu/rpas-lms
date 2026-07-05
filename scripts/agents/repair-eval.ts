/**
 * Disabled graded repair eval.
 *
 * The legacy catalog uses exit-code-only Node checks, which cannot prove that an
 * untrusted repair actually ran the assertions (`process.exit(0)` can fake green).
 * Keep this command as an explicit, side-effect-free redirect until the catalog is
 * migrated to the real Vitest substrate. NOTE: Docker+Vitest is heuristic, NOT proof
 * (the code under test shares the verifier's process domain). Under the black-box
 * verification decision, the untrusted-author eval `pnpm real-repair-eval` is a
 * production-black-box run and terminates NEEDS_HUMAN until a real attestor exists.
 */
console.error(
  "eval:repair is disabled (exit-code-only catalog cannot prove a check ran → false-green risk). " +
    "Use `pnpm real-repair-eval` (real Vitest + Docker — heuristic, not proof; a production-black-box " +
    "run terminates NEEDS_HUMAN until a real attestor exists).",
);
process.exitCode = 1;
