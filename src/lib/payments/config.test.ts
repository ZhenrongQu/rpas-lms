import { describe, expect, it } from "vitest";
import {
  ADVANCED_BUNDLE_PRODUCT,
  FLIGHT_REVIEW_PRODUCT,
  getPaymentConfig,
  advancedBundleCheckoutUrls,
  priceIdForProduct,
} from "./config";

describe("payment config", () => {
  it("reads Stripe checkout settings from env", () => {
    const config = getPaymentConfig();
    expect(ADVANCED_BUNDLE_PRODUCT).toBe("paid_access");
    expect(config.stripeSecretKey).toBe("sk_test_unit");
    expect(config.webhookSecret).toBe("whsec_unit");
    expect(config.advancedBundlePriceId).toBe("price_advanced_bundle_unit");
    expect(config.flightReviewPriceId).toBe("price_flight_review_unit");
    expect(config.appUrl).toBe("https://rpas.test");
  });

  it("resolves the Stripe price id per product", () => {
    const config = getPaymentConfig();
    expect(priceIdForProduct(ADVANCED_BUNDLE_PRODUCT, config)).toBe("price_advanced_bundle_unit");
    expect(priceIdForProduct(FLIGHT_REVIEW_PRODUCT, config)).toBe("price_flight_review_unit");
  });

  it("builds localized success and cancel URLs", () => {
    expect(advancedBundleCheckoutUrls("zh")).toEqual({
      successUrl: "https://rpas.test/zh/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://rpas.test/zh/billing/cancelled",
    });
  });
});
