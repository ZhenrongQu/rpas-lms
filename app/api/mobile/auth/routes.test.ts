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
import { clientIp, enforceRateLimit } from "../../../../src/lib/security/rateLimit";

vi.mock("../../../../src/lib/auth/localAccount", () => ({
  authorizeLocalPasswordLogin: vi.fn(),
}));

vi.mock("../../../../src/lib/mobile/session", () => ({
  createMobileSession: vi.fn(),
  readMobileSession: vi.fn(),
  revokeMobileSession: vi.fn(),
  bearerToken: (headers: Headers) => {
    const header = headers.get("authorization");
    if (!header) return null;
    const firstSpace = header.indexOf(" ");
    if (firstSpace < 0) return null;

    const scheme = header.slice(0, firstSpace);
    if (scheme.toLowerCase() !== "bearer") return null;

    const token = header.slice(firstSpace + 1).trim();
    return token ? token : null;
  },
}));

vi.mock("../../../../src/lib/security/rateLimit", () => ({
  clientIp: vi.fn(() => "203.0.113.10"),
  enforceRateLimit: vi.fn(async () => null),
}));

describe("mobile auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientIp).mockReturnValue("203.0.113.10");
    vi.mocked(enforceRateLimit).mockResolvedValue(null);
  });

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
    expect(enforceRateLimit).toHaveBeenCalledWith("mobile-login:ip:203.0.113.10", {
      limit: 30,
      windowSec: 15 * 60,
      blockSec: 15 * 60,
    });
    expect(authorizeLocalPasswordLogin).toHaveBeenCalledWith({
      email: "learner@test.com",
      password: "secret123",
      ip: "203.0.113.10",
    });
    expect(createMobileSession).toHaveBeenCalledWith({ userId: "user_1" });
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

  it("rejects malformed JSON on login", async () => {
    const res = await login(
      new Request("http://test/api/mobile/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid JSON" });
  });

  it("rejects invalid body on login", async () => {
    const res = await login(
      new Request("http://test/api/mobile/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid body" });
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
    expect(readMobileSession).toHaveBeenCalledWith("mobile-token");
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

  it("rejects invalid or revoked bearer token on me", async () => {
    vi.mocked(readMobileSession).mockResolvedValue(null);

    const res = await me(
      new Request("http://test/api/mobile/me", {
        headers: { authorization: "bearer   mobile-token   " },
      }),
    );

    expect(readMobileSession).toHaveBeenCalledWith("mobile-token");
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

  it("returns ok on logout without token", async () => {
    const res = await logout(
      new Request("http://test/api/mobile/auth/logout", {
        method: "POST",
      }),
    );

    expect(revokeMobileSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
