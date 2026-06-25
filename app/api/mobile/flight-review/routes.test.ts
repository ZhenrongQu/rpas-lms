import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "./route";
import { readMobileSession } from "../../../../src/lib/mobile/session";
import { canBookFlightReview } from "../../../../src/lib/payments/entitlements";
import {
  listOpenSlots,
  getUserBooking,
  bookSlot,
  cancelBooking,
} from "../../../../src/lib/flightReview/booking";
import {
  notifyBookingChange,
  notifyCancellation,
} from "../../../../src/lib/flightReview/notifications";

vi.mock("../../../../src/lib/mobile/session", () => ({
  readMobileSession: vi.fn(),
  bearerToken: (headers: Headers) => {
    const header = headers.get("authorization");
    if (!header) return null;
    const firstSpace = header.indexOf(" ");
    if (firstSpace < 0) return null;
    if (header.slice(0, firstSpace).toLowerCase() !== "bearer") return null;
    const token = header.slice(firstSpace + 1).trim();
    return token ? token : null;
  },
}));
vi.mock("../../../../src/lib/payments/entitlements", () => ({ canBookFlightReview: vi.fn() }));
vi.mock("../../../../src/lib/flightReview/booking", () => ({
  listOpenSlots: vi.fn(),
  getUserBooking: vi.fn(),
  bookSlot: vi.fn(),
  cancelBooking: vi.fn(),
}));
vi.mock("../../../../src/lib/flightReview/notifications", () => ({
  notifyBookingChange: vi.fn(),
  notifyCancellation: vi.fn(),
}));

const slot = {
  id: "slot_1",
  startsAt: new Date("2026-08-01T17:00:00.000Z"),
  durationMin: 60,
  location: "Vancouver",
  examinerName: "Avery",
};

function req(method: string, body?: unknown): Request {
  return new Request("http://test/api/mobile/flight-review", {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("mobile flight-review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMobileSession).mockResolvedValue({
      userId: "user_1",
      email: "learner@test.com",
      name: "Learner",
      accessTier: "PAID",
    });
  });

  it("GET returns eligibility, current booking, and open slots", async () => {
    vi.mocked(canBookFlightReview).mockResolvedValue(true);
    vi.mocked(getUserBooking).mockResolvedValue(null as never);
    vi.mocked(listOpenSlots).mockResolvedValue([{ ...slot, booking: null }] as never);

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      eligible: true,
      booking: null,
      slots: [
        {
          id: "slot_1",
          startsAt: "2026-08-01T17:00:00.000Z",
          durationMin: 60,
          location: "Vancouver",
          examinerName: "Avery",
        },
      ],
    });
  });

  it("POST books a slot and emails confirmation", async () => {
    vi.mocked(canBookFlightReview).mockResolvedValue(true);
    vi.mocked(bookSlot).mockResolvedValue({
      ok: true,
      booking: { id: "bk_1", slot },
      previousSlot: null,
      action: "created",
    } as never);

    const res = await POST(req("POST", { slotId: "slot_1" }));
    expect(res.status).toBe(201);
    expect(bookSlot).toHaveBeenCalledWith("user_1", "slot_1");
    expect(notifyBookingChange).toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      booking: {
        id: "bk_1",
        slot: {
          id: "slot_1",
          startsAt: "2026-08-01T17:00:00.000Z",
          durationMin: 60,
          location: "Vancouver",
          examinerName: "Avery",
        },
      },
    });
  });

  it("POST is rejected when not eligible", async () => {
    vi.mocked(canBookFlightReview).mockResolvedValue(false);

    const res = await POST(req("POST", { slotId: "slot_1" }));
    expect(res.status).toBe(403);
    expect(bookSlot).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: "not_eligible" });
  });

  it("POST returns 409 when the slot is taken", async () => {
    vi.mocked(canBookFlightReview).mockResolvedValue(true);
    vi.mocked(bookSlot).mockResolvedValue({ ok: false, error: "slot_taken" } as never);

    const res = await POST(req("POST", { slotId: "slot_1" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "slot_taken" });
  });

  it("DELETE cancels the booking", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({ id: "bk_1", slot } as never);

    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect(notifyCancellation).toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("DELETE returns 404 when there is no booking", async () => {
    vi.mocked(cancelBooking).mockResolvedValue(null);

    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "no_booking" });
  });
});
