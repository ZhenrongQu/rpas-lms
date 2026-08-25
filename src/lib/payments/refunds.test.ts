import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { __setStripeClientForTests } from "./stripeClient";
import {
  approveRefund,
  listRefundRequests,
  recordDispute,
  rejectRefund,
  requestRefund,
  settleRefundFromStripe,
} from "./refunds";
import { hasPaidAccess } from "./entitlements";
import { countAvailableCredits } from "../flightReview/credits";
import { bookSlot, getActiveBooking } from "../flightReview/booking";

const USER = "refund-user";

async function reset() {
  await prisma.refundRequest.deleteMany();
  await prisma.flightReviewCredit.deleteMany();
  await prisma.flightReviewBooking.deleteMany();
  await prisma.flightReviewSlot.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.customer.deleteMany({ where: { id: USER } });
}

/** Stubs Stripe's refund endpoint with the status it should report back. */
function stripeRefunding(status: "succeeded" | "pending") {
  __setStripeClientForTests({ refunds: { create: async () => ({ id: "re_1", status }) } });
}

async function seedPayment(product: string, checkoutSessionId = "cs_1"): Promise<string> {
  const payment = await prisma.payment.create({
    data: {
      userId: USER,
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: `pi_${checkoutSessionId}`,
      product,
      amountTotal: 9900,
      currency: "cad",
      status: "paid",
    },
  });
  return payment.id;
}

describe("refund requests (PRD U5)", () => {
  beforeEach(async () => {
    await reset();
    __setStripeClientForTests(null);
    await prisma.customer.create({ data: { id: USER, email: "refund@test.local", accessTier: "PAID" } });
  });
  afterAll(async () => {
    await reset();
    __setStripeClientForTests(null);
    await prisma.$disconnect();
  });

  describe("filing", () => {
    it("files a pending request without touching access", async () => {
      const paymentId = await seedPayment("paid_access");

      const result = await requestRefund(USER, paymentId, "changed my mind");

      expect(result.ok).toBe(true);
      expect(await hasPaidAccess(USER)).toBe(true); // nothing revoked before review
      const [item] = await listRefundRequests();
      expect(item.status).toBe("PENDING");
    });

    it("refuses a second open request for the same payment", async () => {
      const paymentId = await seedPayment("paid_access");
      await requestRefund(USER, paymentId, "first");

      expect(await requestRefund(USER, paymentId, "again")).toEqual({
        ok: false,
        error: "already_requested",
      });
    });

    it("refuses a payment that is not the caller's", async () => {
      await prisma.customer.create({ data: { id: "other", email: "other@test.local" } });
      const paymentId = await seedPayment("paid_access");

      expect(await requestRefund("other", paymentId, "not mine")).toEqual({
        ok: false,
        error: "payment_not_found",
      });
      await prisma.customer.delete({ where: { id: "other" } });
    });
  });

  describe("admin review", () => {
    it("refunds and revokes course access in one action when Stripe settles immediately", async () => {
      const paymentId = await seedPayment("paid_access");
      await prisma.entitlement.create({
        data: { userId: USER, product: "paid_access", source: "stripe_checkout" },
      });
      const filed = await requestRefund(USER, paymentId, "refund please");
      stripeRefunding("succeeded");

      const result = await approveRefund(filed.ok ? filed.requestId : "", "verified");

      expect(result).toEqual({ ok: true, status: "REFUNDED" });
      expect(await hasPaidAccess(USER)).toBe(false);
      const user = await prisma.customer.findUniqueOrThrow({ where: { id: USER } });
      expect(user.accessTier).toBe("FREE");
    });

    it("waits for the webhook when Stripe reports the refund as pending", async () => {
      const paymentId = await seedPayment("paid_access");
      await prisma.entitlement.create({
        data: { userId: USER, product: "paid_access", source: "stripe_checkout" },
      });
      const filed = await requestRefund(USER, paymentId, "refund please");
      stripeRefunding("pending");

      const result = await approveRefund(filed.ok ? filed.requestId : "");

      expect(result).toEqual({ ok: true, status: "REFUNDING" });
      // The money is not back yet — taking access away now would strand a
      // customer who may still end up paying.
      expect(await hasPaidAccess(USER)).toBe(true);
    });

    it("rejecting leaves access alone", async () => {
      const paymentId = await seedPayment("paid_access");
      const filed = await requestRefund(USER, paymentId, "refund please");

      expect(await rejectRefund(filed.ok ? filed.requestId : "", "outside the window")).toBe(true);

      const [item] = await listRefundRequests();
      expect(item.status).toBe("REJECTED");
      expect(item.adminNote).toBe("outside the window");
      expect(await hasPaidAccess(USER)).toBe(true);
    });

    it("will not approve a request that is no longer pending", async () => {
      const paymentId = await seedPayment("paid_access");
      const filed = await requestRefund(USER, paymentId, "refund please");
      await rejectRefund(filed.ok ? filed.requestId : "");

      expect(await approveRefund(filed.ok ? filed.requestId : "")).toEqual({
        ok: false,
        error: "not_pending",
      });
    });
  });

  describe("flight review refunds", () => {
    async function seedCreditPayment(): Promise<string> {
      const paymentId = await seedPayment("flight_review", "cs_fr");
      await prisma.flightReviewCredit.create({
        data: { customerId: USER, source: "stripe_checkout", paymentId: "cs_fr" },
      });
      return paymentId;
    }

    it("revokes an unused credit", async () => {
      const paymentId = await seedCreditPayment();
      const filed = await requestRefund(USER, paymentId, "never used it");
      stripeRefunding("succeeded");

      await approveRefund(filed.ok ? filed.requestId : "");

      expect(await countAvailableCredits(USER)).toBe(0);
    });

    it("releases the slot before revoking a credit that is holding a booking", async () => {
      const paymentId = await seedCreditPayment();
      const slot = await prisma.flightReviewSlot.create({
        data: { startsAt: new Date(Date.now() + 7 * 86_400_000), location: "YVR", examinerName: "Pat" },
      });
      await bookSlot(USER, slot.id);
      const filed = await requestRefund(USER, paymentId, "cannot make it");
      stripeRefunding("succeeded");

      await approveRefund(filed.ok ? filed.requestId : "");

      expect(await getActiveBooking(USER)).toBeNull(); // slot is bookable again
      expect(await countAvailableCredits(USER)).toBe(0);
    });

    it("tells the admin when the credit was already used, instead of deciding for them", async () => {
      const paymentId = await seedPayment("flight_review", "cs_fr");
      await prisma.flightReviewCredit.create({
        data: {
          customerId: USER,
          source: "stripe_checkout",
          paymentId: "cs_fr",
          consumedAt: new Date(),
        },
      });
      await requestRefund(USER, paymentId, "want my money back");

      const [item] = await listRefundRequests();

      expect(item.creditConsumed).toBe(true);
      expect(item.status).toBe("PENDING"); // surfaced, not auto-rejected
    });
  });

  describe("webhook settlement", () => {
    it("finishes a refund that Stripe reported as pending", async () => {
      const paymentId = await seedPayment("paid_access");
      await prisma.entitlement.create({
        data: { userId: USER, product: "paid_access", source: "stripe_checkout" },
      });
      const filed = await requestRefund(USER, paymentId, "refund please");
      stripeRefunding("pending");
      await approveRefund(filed.ok ? filed.requestId : "");

      await settleRefundFromStripe("pi_cs_1");

      const [item] = await listRefundRequests();
      expect(item.status).toBe("REFUNDED");
      expect(await hasPaidAccess(USER)).toBe(false);
    });

    it("revokes access for a refund issued straight from the Stripe dashboard", async () => {
      await seedPayment("paid_access");
      await prisma.entitlement.create({
        data: { userId: USER, product: "paid_access", source: "stripe_checkout" },
      });

      await settleRefundFromStripe("pi_cs_1"); // no request was ever filed

      expect(await hasPaidAccess(USER)).toBe(false);
      const payment = await prisma.payment.findFirstOrThrow({ where: { userId: USER } });
      expect(payment.status).toBe("refunded");
    });

    it("ignores a payment intent it does not know", async () => {
      await expect(settleRefundFromStripe("pi_unknown")).resolves.toBeUndefined();
    });
  });

  describe("disputes", () => {
    it("opens a request for review without revoking — a dispute can still be won", async () => {
      await seedPayment("paid_access");
      await prisma.entitlement.create({
        data: { userId: USER, product: "paid_access", source: "stripe_checkout" },
      });

      await recordDispute("pi_cs_1");

      const [item] = await listRefundRequests();
      expect(item.reason).toBe("dispute");
      expect(item.status).toBe("PENDING");
      expect(await hasPaidAccess(USER)).toBe(true);
    });

    it("does not pile a dispute on top of a request already in flight", async () => {
      const paymentId = await seedPayment("paid_access");
      await requestRefund(USER, paymentId, "filed first");

      await recordDispute("pi_cs_1");

      expect((await listRefundRequests()).length).toBe(1);
    });
  });
});
