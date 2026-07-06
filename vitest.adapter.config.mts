import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// A MINIMAL vitest config for the remediation real-repo adapter. The remediation
// kernel runs a SINGLE selected test file against a checked-out worktree to
// reproduce/verify a defect — with NO globalSetup and NO DB env, so a pure module
// reproduces in ~1s without Postgres. (The main vitest.config.mts resets + seeds a
// database in globalSetup, which is far too heavy — and unnecessary — for an
// isolated per-defect reproduction.) The runner passes explicit test files as args.
export default defineConfig({
  resolve: {
    // Resolve @ against the project root (cwd), NOT the config file's own location — so the
    // config works whether it sits in the worktree (host runner, cwd = worktree) or is
    // copied into a writable dir for the isolated runner (cwd = /workspace/repo via --root).
    alias: { "@": resolve(process.cwd(), "src") },
  },
  // node_modules is symlinked into the worktree's parent (outside the vite root),
  // so relax the fs allow-list — this is a throwaway per-defect reproduction sandbox.
  server: { fs: { strict: false } },
  test: {
    environment: "node",
  },
});
