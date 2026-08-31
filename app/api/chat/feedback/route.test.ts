import { beforeEach, describe, it, expect } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as feedback } from "./route";

const OWNER = { "x-test-user-id": "owner1", "x-test-access-tier": "PAID" };
const OTHER = { "x-test-user-id": "other1", "x-test-access-tier": "PAID" };
const TURN = "11111111-1111-4111-8111-111111111111";

function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://test/api/chat/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/feedback", () => {
  beforeEach(async () => {
    await prisma.assistantTurn.deleteMany();
    await prisma.assistantTurn.create({
      data: {
        id: TURN,
        conversationId: "conv-1",
        turnIndex: 0,
        userId: "owner1",
        locale: "EN",
        question: "q",
        answer: "a",
        model: "claude-sonnet-4-6",
      },
    });
  });

  it("401 when unauthenticated", async () => {
    expect((await feedback(post({ turnId: TURN, rating: 1 }))).status).toBe(401);
  });

  it("400 on a rating outside {-1, 1}", async () => {
    const res = await feedback(post({ turnId: TURN, rating: 5 }, OWNER));
    expect(res.status).toBe(400);
  });

  it("records the owner's rating", async () => {
    const res = await feedback(post({ turnId: TURN, rating: -1 }, OWNER));
    expect(res.status).toBe(200);

    const row = await prisma.assistantTurn.findUniqueOrThrow({ where: { id: TURN } });
    expect(row.rating).toBe(-1);
    expect(row.ratedAt).not.toBeNull();
  });

  // Someone else's turn must be indistinguishable from a turn that isn't there,
  // or the endpoint becomes a way to probe for other students' turn ids.
  it("404s on another user's turn, and leaves it unrated", async () => {
    const res = await feedback(post({ turnId: TURN, rating: 1 }, OTHER));
    expect(res.status).toBe(404);

    const row = await prisma.assistantTurn.findUniqueOrThrow({ where: { id: TURN } });
    expect(row.rating).toBeNull();
  });

  it("404s on a turn that does not exist — same shape as the not-yours case", async () => {
    const res = await feedback(
      post({ turnId: "22222222-2222-4222-8222-222222222222", rating: 1 }, OWNER),
    );
    expect(res.status).toBe(404);
  });
});
