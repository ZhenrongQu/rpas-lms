/**
 * One-off DEMO seed: 1 admin, 1 customer, and questions/lessons spanning the
 * plan tiers (guest/free/paid difficulties; FREE & PAID lessons; basic & advanced).
 * Idempotent (upserts). Run against whatever DATABASE_URL points at.
 *
 *   set -a; source .env; set +a
 *   DATABASE_URL="$DIRECT_URL" pnpm exec tsx scripts/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const OPTS = [
  { optionId: "a", labelEN: "Correct answer", labelZH: "正确答案", isCorrect: true },
  { optionId: "b", labelEN: "Wrong B", labelZH: "错误 B", isCorrect: false },
  { optionId: "c", labelEN: "Wrong C", labelZH: "错误 C", isCorrect: false },
  { optionId: "d", labelEN: "Wrong D", labelZH: "错误 D", isCorrect: false },
];

function qData(id: string, difficulty: number, stemEN: string, stemZH: string) {
  return {
    id,
    moduleId: "air-law",
    type: "SINGLE",
    selectCount: 1,
    difficulty,
    stemEN,
    stemZH,
    explEN: "Option A is correct.",
    explZH: "选项 A 正确。",
    refEN: "Air Law §1",
    refZH: "航空法 §1",
  };
}

async function main() {
  // ── 1 admin ────────────────────────────────────────────────────────────────
  const admin = await prisma.admin.upsert({
    where: { username: "rpasadmin" },
    update: { hashedPassword: await bcrypt.hash("admin12345", 10), email: "admin@rpas.test" },
    create: {
      username: "rpasadmin",
      email: "admin@rpas.test",
      hashedPassword: await bcrypt.hash("admin12345", 10),
      displayName: "RPAS Admin",
    },
  });

  // ── 1 customer (FREE tier, email-verified so it can log in) ──────────────────
  const customer = await prisma.customer.upsert({
    where: { email: "customer@rpas.test" },
    update: { accessTier: "FREE" },
    create: {
      userNumber: 1,
      email: "customer@rpas.test",
      displayName: "Demo Customer",
      hashedPassword: await bcrypt.hash("customer12345", 10),
      accessTier: "FREE",
      emailVerifiedAt: new Date(),
      identities: {
        create: { provider: "email", providerAccountId: "customer@rpas.test", verifiedAt: new Date() },
      },
    },
  });

  // ── questions across plan tiers ──────────────────────────────────────────────
  // Basic bank: d0 = guest taster, d1 = free, d2 = paid.
  const basicQs = [
    qData("air-law-0001", 0, "Guest-tier basic question (d0)", "访客级基础题 (d0)"),
    qData("air-law-0002", 1, "Free-tier basic question (d1)", "免费级基础题 (d1)"),
    qData("air-law-0003", 2, "Paid-tier basic question (d2)", "付费级基础题 (d2)"),
  ];
  for (const d of basicQs) {
    await prisma.basicQuestionBank.upsert({
      where: { id: d.id },
      create: { ...d, options: { create: OPTS } },
      update: { ...d, options: { deleteMany: {}, create: OPTS } },
    });
  }
  // Advanced bank: d1, d2 (advanced exams are paid-only).
  const advQs = [
    qData("air-law-0001", 1, "Advanced question (d1)", "高级题 (d1)"),
    qData("air-law-0002", 2, "Advanced question (d2)", "高级题 (d2)"),
  ];
  for (const d of advQs) {
    await prisma.advancedQuestionBank.upsert({
      where: { id: d.id },
      create: { ...d, options: { create: OPTS } },
      update: { ...d, options: { deleteMany: {}, create: OPTS } },
    });
  }

  // ── lessons across plan tiers ────────────────────────────────────────────────
  const lessons = [
    {
      table: "basic" as const, slug: "intro", order: 1, access: "FREE", certLevel: "BASIC",
      titleEN: "Intro to Air Law (FREE)", titleZH: "航空法入门（免费）",
      cp: "air-law-0001",
    },
    {
      table: "basic" as const, slug: "deep-dive", order: 2, access: "PAID", certLevel: "BASIC",
      titleEN: "Air Law Deep Dive (PAID)", titleZH: "航空法进阶（付费）",
      cp: "air-law-0002",
    },
    {
      table: "advanced" as const, slug: "adv-ops", order: 1, access: "PAID", certLevel: "ADVANCED",
      titleEN: "Advanced Operations (PAID)", titleZH: "高级运行（付费）",
      cp: "air-law-0001",
    },
  ];
  for (const l of lessons) {
    const lessonId = `${l.table}/air-law/${l.slug}`;
    const body = `Lesson body for ${l.titleEN}.\n\n<Checkpoint questionId="${l.cp}" />\n`;
    const data = {
      lessonId, course: l.table, moduleId: "air-law", slug: l.slug, order: l.order,
      estMinutes: 8, certLevel: l.certLevel, access: l.access,
      titleEN: l.titleEN, titleZH: l.titleZH, bodyEN: body, bodyZH: body,
    };
    if (l.table === "basic") {
      await prisma.basicLesson.upsert({ where: { lessonId }, create: data, update: data });
    } else {
      await prisma.advancedLesson.upsert({ where: { lessonId }, create: data, update: data });
    }
  }

  console.log("✓ demo seed complete");
  console.log(`  admin    : username=rpasadmin  password=admin12345  (${admin.email})`);
  console.log(`  customer : email=customer@rpas.test  password=customer12345  tier=FREE  (#${customer.userNumber})`);
  console.log("  basic questions : air-law-0001 (d0/guest), 0002 (d1/free), 0003 (d2/paid)");
  console.log("  advanced questions : air-law-0001 (d1), 0002 (d2)");
  console.log("  lessons : basic/intro (FREE), basic/deep-dive (PAID), advanced/adv-ops (PAID)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("✗", err.message ?? err);
    await prisma.$disconnect();
    process.exit(1);
  });
