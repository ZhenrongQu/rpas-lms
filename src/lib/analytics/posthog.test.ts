import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEnabled, capture, identify } from "./posthog";

const KEY = "NEXT_PUBLIC_POSTHOG_KEY";
const HOST = "NEXT_PUBLIC_POSTHOG_HOST";

describe("posthog capture (PRD U7)", () => {
  const fetchMock = vi.fn();
  const originalKey = process.env[KEY];
  const originalHost = process.env[HOST];

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    delete process.env[HOST];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env[KEY];
    else process.env[KEY] = originalKey;
    if (originalHost === undefined) delete process.env[HOST];
    else process.env[HOST] = originalHost;
  });

  describe("without a key configured", () => {
    beforeEach(() => { delete process.env[KEY]; });

    it("reports itself disabled and sends nothing", async () => {
      expect(analyticsEnabled()).toBe(false);

      await capture("exam_started", "user-1");
      await identify("user-1", "anon-1");

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("with a key configured", () => {
    beforeEach(() => { process.env[KEY] = "phc_test"; });

    it("posts the event against the given distinct id", async () => {
      await capture("checkout_initiated", "customer-42", { product: "paid_access" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toMatchObject({
        api_key: "phc_test",
        event: "checkout_initiated",
        distinct_id: "customer-42",
        properties: { product: "paid_access" },
      });
    });

    it("stitches the anonymous history onto the account on identify", async () => {
      await identify("customer-42", "anon-7", { email: "a@b.test" });

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.event).toBe("$identify");
      // Without $anon_distinct_id the conversion funnel breaks in half at exactly
      // the step it exists to measure.
      expect(body.distinct_id).toBe("customer-42");
      expect(body.properties.$anon_distinct_id).toBe("anon-7");
      expect(body.properties.$set).toEqual({ email: "a@b.test" });
    });

    it("honours a self-hosted host without a trailing slash problem", async () => {
      process.env[HOST] = "https://ph.example.test/";

      await capture("landing_viewed", "anon-1");

      expect(fetchMock.mock.calls[0][0]).toBe("https://ph.example.test/i/v0/e/");
    });

    it("swallows a transport failure — analytics never breaks the product", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));

      await expect(capture("payment_succeeded", "customer-42")).resolves.toBeUndefined();
    });
  });
});
