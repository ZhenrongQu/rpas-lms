import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../../src/lib/db";

// Mock only the NextAuth session source; the Admin-row lookup hits the real DB.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../../auth", () => ({ auth: authMock }));

import { GET, POST } from "./route";
import { GET as GET_ONE, PUT, DELETE } from "./[id]/route";

const ADMIN = "cp-route-admin";
const CUSTOMER = "cp-route-customer";
const LESSON = "basic/air-law/intro-1"; // seeded by scripts/seed-content.ts

function postReq(body: unknown): Request {
  return new Request("http://test/api/coriander/checkpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = (over: Record<string, unknown> = {}) => ({
  course: "basic",
  moduleId: "air-law",
  lessonId: LESSON,
  order: 0,
  type: "SINGLE",
  selectCount: 1,
  stemEN: "Q?",
  stemZH: "问题?",
  explEN: "because",
  explZH: "因为",
  refEN: "ref",
  refZH: "参考",
  tags: [],
  options: [
    { optionId: "a", labelEN: "A", labelZH: "甲", isCorrect: true },
    { optionId: "b", labelEN: "B", labelZH: "乙", isCorrect: false },
  ],
  ...over,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asAdmin = () => authMock.mockResolvedValue({ user: { id: ADMIN, isAdmin: true } });
// Forged isAdmin on a customer id — must still be rejected (id not in Admin).
const asCustomer = () => authMock.mockResolvedValue({ user: { id: CUSTOMER, isAdmin: true } });

async function cleanup() {
  await prisma.checkpointQuestion.deleteMany({ where: { lessonId: LESSON } });
  await prisma.admin.deleteMany({ where: { id: ADMIN } });
  await prisma.customer.deleteMany({ where: { id: CUSTOMER } });
}

describe("/api/coriander/checkpoints (admin CMS)", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.admin.create({ data: { id: ADMIN, username: "cp-route-admin", hashedPassword: "x" } });
    await prisma.customer.create({ data: { id: CUSTOMER, username: "cp-route-customer", hashedPassword: "x" } });
  });
  beforeEach(() => authMock.mockReset());
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("404 for a non-admin on list and create", async () => {
    asCustomer();
    expect((await GET(new Request("http://test/api/coriander/checkpoints"))).status).toBe(404);
    expect((await POST(postReq(validBody()))).status).toBe(404);
  });

  it("422 for a bad body", async () => {
    asAdmin();
    expect((await POST(postReq({ course: "basic" }))).status).toBe(422);
  });

  it("422 when lessonId does not resolve to a lesson", async () => {
    asAdmin();
    expect((await POST(postReq(validBody({ lessonId: "basic/air-law/nope-cp" })))).status).toBe(422);
  });

  it("creates, lists, gets, updates, and archives a checkpoint", async () => {
    asAdmin();
    const created = await POST(postReq(validBody()));
    expect(created.status).toBe(201);
    const row = (await created.json()) as { id: string };
    expect(row.id).toMatch(/^cp-air-law-\d{4}$/);

    const list = await GET(new Request(`http://test/api/coriander/checkpoints?lessonId=${LESSON}`));
    expect(list.status).toBe(200);
    const rows = (await list.json()) as { id: string }[];
    expect(rows.some((r) => r.id === row.id)).toBe(true);

    expect((await GET_ONE(new Request("http://test"), ctx(row.id))).status).toBe(200);

    const upd = await PUT(postReq(validBody({ stemEN: "Updated?" })), ctx(row.id));
    expect(upd.status).toBe(200);

    expect((await DELETE(new Request("http://test"), ctx(row.id))).status).toBe(200);
    const archived = await prisma.checkpointQuestion.findUnique({ where: { id: row.id } });
    expect(archived?.status).toBe("ARCHIVED");
  });
});
