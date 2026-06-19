import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../src/lib/db";

// SEC-12: prove every admin CMS route under /api/coriander is guarded — a
// non-admin session (even one forging isAdmin) gets 404 before any work — and
// that the content-create routes reject bad bodies with 422. The checkpoints
// routes have their own dedicated test; everything else is covered here.

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../../../auth", () => ({ auth: authMock }));

import { GET as lessonsGET, POST as lessonsPOST } from "./lessons/route";
import { GET as lessonGET, PUT as lessonPUT } from "./lessons/[id]/route";
import { GET as lessonVideoGET, PUT as lessonVideoPUT, DELETE as lessonVideoDELETE } from "./lessons/[id]/video/route";
import { POST as uploadUrlPOST } from "./lessons/[id]/video/upload-url/route";
import { GET as questionsGET, POST as questionsPOST } from "./questions/route";
import { GET as questionGET, PUT as questionPUT, DELETE as questionDELETE } from "./questions/[id]/route";
import { GET as slotsGET, POST as slotsPOST } from "./flight-review/slots/route";
import { PUT as slotPUT, DELETE as slotDELETE } from "./flight-review/slots/[id]/route";
import { POST as grantPOST, DELETE as grantDELETE } from "./flight-review/grant/route";
import { GET as mfaGET, POST as mfaPOST } from "./mfa/route";

const ADMIN = "sec12-admin";
const CUSTOMER = "sec12-customer";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/x");
const body = (b: unknown) =>
  new Request("http://test/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

const asAdmin = () => authMock.mockResolvedValue({ user: { id: ADMIN, isAdmin: true } });
// Forged isAdmin on a customer id — must still be rejected (id not in Admin table).
const asNonAdmin = () => authMock.mockResolvedValue({ user: { id: CUSTOMER, isAdmin: true } });

async function cleanup() {
  await prisma.admin.deleteMany({ where: { id: ADMIN } });
  await prisma.customer.deleteMany({ where: { id: CUSTOMER } });
}

describe("/api/coriander/* admin guards (SEC-12)", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.admin.create({ data: { id: ADMIN, username: "sec12-admin", hashedPassword: "x" } });
    await prisma.customer.create({ data: { id: CUSTOMER, username: "sec12-customer", hashedPassword: "x" } });
  });
  beforeEach(() => authMock.mockReset());
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("returns 404 for a non-admin on every coriander route", async () => {
    asNonAdmin();
    const calls: Array<[string, Promise<Response>]> = [
      ["lessons GET", lessonsGET(req())],
      ["lessons POST", lessonsPOST(body({}))],
      ["lesson GET", lessonGET(req(), ctx("x"))],
      ["lesson PUT", lessonPUT(body({}), ctx("x"))],
      ["lessonVideo GET", lessonVideoGET(req(), ctx("x"))],
      ["lessonVideo PUT", lessonVideoPUT(body({}), ctx("x"))],
      ["lessonVideo DELETE", lessonVideoDELETE(req(), ctx("x"))],
      ["uploadUrl POST", uploadUrlPOST(req(), ctx("x"))],
      ["questions GET", questionsGET(req())],
      ["questions POST", questionsPOST(body({}))],
      ["question GET", questionGET(req(), ctx("x"))],
      ["question PUT", questionPUT(body({}), ctx("x"))],
      ["question DELETE", questionDELETE(req(), ctx("x"))],
      ["slots GET", slotsGET()],
      ["slots POST", slotsPOST(body({}))],
      ["slot PUT", slotPUT(body({}), ctx("x"))],
      ["slot DELETE", slotDELETE(req(), ctx("x"))],
      ["grant POST", grantPOST(body({}))],
      ["grant DELETE", grantDELETE(body({}))],
      ["mfa GET", mfaGET()],
      ["mfa POST", mfaPOST(body({ action: "begin" }))],
    ];
    for (const [name, p] of calls) {
      expect((await p).status, name).toBe(404);
    }
  });

  it("content-create routes reject a bad body with 422 for an admin", async () => {
    asAdmin();
    expect((await questionsPOST(body({ bad: true }))).status).toBe(422);
    expect((await lessonsPOST(body({ bad: true }))).status).toBe(422);
    expect((await slotsPOST(body({ bad: true }))).status).toBe(422);
  });
});
