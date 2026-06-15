import { describe, expect, it } from "vitest";
import {
  PAID_ACCESS_PRODUCT,
  FLIGHT_REVIEW_PRODUCT,
  getPaymentConfig,
  paidAccessCheckoutUrls,
  priceIdForProduct,
} from "./config";

describe("payment config", () => {
  it("reads Stripe checkout settings from env", () => {
    const config = getPaymentConfig();
    expect(PAID_ACCESS_PRODUCT).toBe("paid_access");
    expect(config.stripeSecretKey).toBe("sk_test_unit");
    expect(config.webhookSecret).toBe("whsec_unit");
    expect(config.paidAccessPriceId).toBe("price_paid_access_unit");
    expect(config.flightReviewPriceId).toBe("price_flight_review_unit");
    expect(config.appUrl).toBe("https://rpas.test");
  });

  it("resolves the Stripe price id per product", () => {
    const config = getPaymentConfig();
    expect(priceIdForProduct(PAID_ACCESS_PRODUCT, config)).toBe("price_paid_access_unit");
    expect(priceIdForProduct(FLIGHT_REVIEW_PRODUCT, config)).toBe("price_flight_review_unit");
  });

  it("builds localized success and cancel URLs", () => {
    expect(paidAccessCheckoutUrls("zh")).toEqual({
      successUrl: "https://rpas.test/zh/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://rpas.test/zh/billing/cancelled",
    });
  });
});
