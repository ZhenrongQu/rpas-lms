import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "../me/route";
import { authorizeLocalPasswordLogin } from "../../../../src/lib/auth/localAccount";
import {
  createMobileSession,
  readMobileSession,
  revokeMobileSession,
} from "../../../../src/lib/mobile/session";

vi.mock("../../../../src/lib/auth/localAccount", () => ({
  authorizeLocalPasswordLogin: vi.fn(),
}));

vi.mock("../../../../src/lib/mobile/session", () => ({
  createMobileSession: vi.fn(),
  readMobileSession: vi.fn(),
  revokeMobileSession: vi.fn(),
  bearerToken: (headers: Headers) => {
    const value = headers.get("authorization");
    return value?.startsWith("Bearer ") ? value.slice(7) : null;
  },
}));

describe("mobile auth routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs in with email and password", async () => {
    vi.mocked(authorizeLocalPasswordLogin).mockResolvedValue({
      id: "user_1",
      email: "learner@test.com",
      displayName: "Learner",
      accessTier: "PAID",
    } as never);
    vi.mocked(createMobileSession).mockResolvedValue({
      token: "mobile-token",
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    });

    const res = await login(
      new Request("http://test/api/mobile/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "learner@test.com", password: "secret123" }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: "mobile-token",
      expiresAt: "2026-07-24T00:00:00.000Z",
      user: {
        id: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "PAID",
      },
    });
  });

  it("rejects bad credentials", async () => {
    vi.mocked(authorizeLocalPasswordLogin).mockResolvedValue(null);

    const res = await login(
      new Request("http://test/api/mobile/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "learner@test.com", password: "wrong" }),
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid credentials" });
  });

  it("restores current account from bearer token", async () => {
    vi.mocked(readMobileSession).mockResolvedValue({
      userId: "user_1",
      email: "learner@test.com",
      name: "Learner",
      accessTier: "FREE",
    });

    const res = await me(
      new Request("http://test/api/mobile/me", {
        headers: { authorization: "Bearer mobile-token" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
  });

  it("rejects missing bearer token on me", async () => {
    const res = await me(new Request("http://test/api/mobile/me"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("revokes the current bearer token on logout", async () => {
    const res = await logout(
      new Request("http://test/api/mobile/auth/logout", {
        method: "POST",
        headers: { authorization: "Bearer mobile-token" },
      }),
    );

    expect(res.status).toBe(200);
    expect(revokeMobileSession).toHaveBeenCalledWith("mobile-token");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
