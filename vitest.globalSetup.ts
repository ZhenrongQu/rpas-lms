import { execSync } from "node:child_process";

// Build (or reset) the Postgres schema in the test database once, before the suite,
// then seed the real question bank + lessons so DB-backed exam/checkpoint/lesson
// tests run against actual content. DATABASE_URL/DIRECT_URL are passed explicitly
// so the Prisma CLI's dotenv (which holds the live Supabase URL) does not override
// them. Must match the TEST_DATABASE_URL default in vitest.config.ts.
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/postgres";
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("pnpm exec prisma db push --force-reset --skip-generate", { stdio: "inherit", env });
  execSync("pnpm exec tsx scripts/seed-content.ts", { stdio: "inherit", env });
}
