import { execSync } from "node:child_process";

// Build (or reset) the SQLite schema in the test database once, before the suite.
// DATABASE_URL is passed explicitly so the Prisma CLI's dotenv does not override it.
export default function setup(): void {
  execSync("pnpm exec prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
