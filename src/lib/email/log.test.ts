import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db";
import { deliveryErrorMessage, recordNotificationAttempt } from "./log";

describe("recordNotificationAttempt", () => {
  beforeEach(async () => {
    await prisma.notificationLog.deleteMany();
  });
  afterAll(async () => {
    await prisma.notificationLog.deleteMany();
  });

  it("records a delivered message as SENT with no error", async () => {
    await recordNotificationAttempt({ kind: "auth_password_reset", recipient: "a@test.local" });

    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log.status).toBe("SENT");
    expect(log.error).toBeNull();
  });

  it("records a rejected message as FAILED, keeping the reason", async () => {
    await recordNotificationAttempt({
      kind: "auth_verification_code",
      recipient: "a@test.local",
      error: "Resend rejected the message: API key is invalid",
    });

    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log.status).toBe("FAILED");
    expect(log.error).toContain("API key is invalid");
  });

  it("truncates a long provider error to the column's budget", async () => {
    await recordNotificationAttempt({
      kind: "auth_verification_code",
      recipient: "a@test.local",
      error: "x".repeat(900),
    });

    const log = await prisma.notificationLog.findFirstOrThrow();
    expect(log.error).toHaveLength(500);
  });

  // The property that lets callers await it on the booking and registration
  // paths: a logging outage must never become an outage of the thing it logs.
  it("never throws when the write itself fails", async () => {
    const create = vi
      .spyOn(prisma.notificationLog, "create")
      .mockRejectedValue(new Error("connection terminated"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordNotificationAttempt({ kind: "auth_password_reset", recipient: "a@test.local" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    create.mockRestore();
    consoleError.mockRestore();
  });
});

describe("deliveryErrorMessage", () => {
  it("takes the message from an Error", () => {
    expect(deliveryErrorMessage(new Error("rejected"))).toBe("rejected");
  });

  it("stringifies whatever else a provider SDK throws", () => {
    expect(deliveryErrorMessage("rejected")).toBe("rejected");
    expect(deliveryErrorMessage({ code: 401 })).toContain("object");
  });
});
