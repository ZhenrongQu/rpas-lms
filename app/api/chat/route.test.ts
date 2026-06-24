import { beforeEach, describe, it, expect } from "vitest";
import { prisma } from "../../../src/lib/db";
import { POST as chat } from "./route";

// These cover the gating chain (auth → paywall → rate limit → validation → key
// check) without making a live Anthropic call. The streaming agent loop itself
// is exercised end-to-end manually with a real ANTHROPIC_API_KEY + login (P2);
// here we lock down the security-critical branches that must never regress.

function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const PAID = { "x-test-user-id": "paid1", "x-test-access-tier": "PAID" };
const FREE = { "x-test-user-id": "free1", "x-test-access-tier": "FREE" };
const oneUserMsg = { messages: [{ role: "user", content: "hello" }] };

describe("POST /api/chat gating", () => {
  beforeEach(async () => {
    await prisma.rateLimit.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.customer.createMany({
      data: [
        { id: "paid1", email: "paid1@test.local", hashedPassword: "x", accessTier: "PAID" },
        { id: "free1", email: "free1@test.local", hashedPassword: "x", accessTier: "FREE" },
      ],
    });
  });

  it("401 when unauthenticated", async () => {
    const res = await chat(post(oneUserMsg));
    expect(res.status).toBe(401);
  });

  it("402 payment_required for a free (unpaid) user", async () => {
    const res = await chat(post(oneUserMsg, FREE));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("payment_required");
  });

  it("400 on malformed body for a paid user", async () => {
    const res = await chat(post({ messages: [] }, PAID));
    expect(res.status).toBe(400);
  });

  it("400 when the last message is not from the user", async () => {
    const res = await chat(
      post({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hey" }] }, PAID),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("last_message_must_be_user");
  });

  it("paid user passes all gates and stops at the missing key (503, no LLM call)", async () => {
    // ANTHROPIC_API_KEY is unset in the vitest env, so a fully-valid paid request
    // proves the gates let it through and it halts cleanly before the model.
    const res = await chat(post(oneUserMsg, PAID));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("assistant_unavailable");
  });
});
