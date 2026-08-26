import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { deliverViaResend } = await import("./resend");

const MESSAGE = {
  from: "noreply@test.local",
  to: "pilot@test.local",
  subject: "s",
  text: "t",
  html: "<p>t</p>",
};

describe("deliverViaResend", () => {
  beforeEach(() => send.mockReset());

  it("returns the provider message id on success", async () => {
    send.mockResolvedValue({ data: { id: "msg_123" }, error: null });

    await expect(deliverViaResend("re_key", MESSAGE)).resolves.toBe("msg_123");
    expect(send).toHaveBeenCalledWith(MESSAGE);
  });

  // The defect this exists for: the SDK RESOLVES on a rejected send, so every
  // caller that only awaited the promise treated a failure as a delivery.
  it("throws when Resend resolves with an error instead of rejecting", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });

    await expect(deliverViaResend("re_key", MESSAGE)).rejects.toThrow(/Invalid `to` field/);
    await expect(deliverViaResend("re_key", MESSAGE)).rejects.toThrow(/validation_error/);
  });

  it("throws on an authentication failure rather than reporting success", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "API key is invalid" },
    });

    await expect(deliverViaResend("bad_key", MESSAGE)).rejects.toThrow(/API key is invalid/);
  });

  it("refuses to call a send successful with no message id", async () => {
    send.mockResolvedValue({ data: null, error: null });

    await expect(deliverViaResend("re_key", MESSAGE)).rejects.toThrow(/neither an error nor a message id/);
  });

  // Not covered: a transport-level rejection from the SDK. There is no try/catch
  // in deliverViaResend, so that propagates by construction — a test for it would
  // be asserting how `await` works, not how this function does.
});
