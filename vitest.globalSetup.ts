import { execSync } from "node:child_process";

// Build (or reset) the SQLite schema in the test database once, before the suite,
// then seed the real question bank + lessons so DB-backed exam/checkpoint/lesson
// tests run against actual content. DATABASE_URL is passed explicitly so the
// Prisma CLI's dotenv does not override it.
export default function setup(): void {
  const env = { ...process.env, DATABASE_URL: "file:./test.db" };
  execSync("pnpm exec prisma db push --force-reset --skip-generate", { stdio: "inherit", env });
  execSync("pnpm exec tsx scripts/seed-content.ts", { stdio: "inherit", env });
}
