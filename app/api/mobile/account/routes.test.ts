import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as changePassword } from "./password/route";
import { changeLocalPassword } from "../../../../src/lib/auth/localAccount";
import { readMobileSession } from "../../../../src/lib/mobile/session";

vi.mock("../../../../src/lib/auth/localAccount", () => ({
  changeLocalPassword: vi.fn(),
}));

vi.mock("../../../../src/lib/mobile/session", () => ({
  readMobileSession: vi.fn(),
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

function request(body: unknown, token = "mobile-token"): Request {
  return new Request("http://test/api/mobile/account/password", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("mobile change-password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMobileSession).mockResolvedValue({
      userId: "user_1",
      email: "learner@test.com",
      name: "Learner",
      accessTier: "PAID",
    });
  });

  it("changes the password for the authenticated account", async () => {
    vi.mocked(changeLocalPassword).mockResolvedValue({ ok: true });

    const res = await changePassword(
      request({ oldPassword: "current123", newPassword: "brandnew123" }),
    );

    expect(res.status).toBe(200);
    expect(changeLocalPassword).toHaveBeenCalledWith({
      userId: "user_1",
      oldPassword: "current123",
      newPassword: "brandnew123",
    });
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("rejects a missing bearer token", async () => {
    const res = await changePassword(
      new Request("http://test/api/mobile/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldPassword: "a", newPassword: "brandnew123" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(changeLocalPassword).not.toHaveBeenCalled();
  });

  it("returns 403 when the current password is wrong", async () => {
    vi.mocked(changeLocalPassword).mockResolvedValue({ ok: false, reason: "wrong_password" });

    const res = await changePassword(
      request({ oldPassword: "nope", newPassword: "brandnew123" }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "wrong_password" });
  });

  it("returns 400 when the new password is too weak", async () => {
    vi.mocked(changeLocalPassword).mockResolvedValue({ ok: false, reason: "weak_password" });

    const res = await changePassword(
      request({ oldPassword: "current123", newPassword: "weakpass1" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "weak_password" });
  });

  it("rejects an invalid body", async () => {
    const res = await changePassword(request({ oldPassword: "current123", newPassword: "short" }));

    expect(res.status).toBe(400);
    expect(changeLocalPassword).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: "invalid body" });
  });
});
