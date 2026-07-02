import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// A MINIMAL vitest config for the remediation real-repo adapter. The remediation
// kernel runs a SINGLE selected test file against a checked-out worktree to
// reproduce/verify a defect — with NO globalSetup and NO DB env, so a pure module
// reproduces in ~1s without Postgres. (The main vitest.config.mts resets + seeds a
// database in globalSetup, which is far too heavy — and unnecessary — for an
// isolated per-defect reproduction.) The runner passes explicit test files as args.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // node_modules is symlinked into the worktree's parent (outside the vite root),
  // so relax the fs allow-list — this is a throwaway per-defect reproduction sandbox.
  server: { fs: { strict: false } },
  test: {
    environment: "node",
  },
});
