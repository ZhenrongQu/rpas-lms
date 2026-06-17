export const ADVANCED_BUNDLE_PRODUCT = "paid_access";
export const FLIGHT_REVIEW_PRODUCT = "flight_review";

export type CheckoutProduct = typeof ADVANCED_BUNDLE_PRODUCT | typeof FLIGHT_REVIEW_PRODUCT;

export type PaymentConfig = {
  stripeSecretKey: string;
  webhookSecret: string;
  advancedBundlePriceId: string;
  // Optional: only required to actually sell the Flight Review add-on. Kept
  // optional so paid-access checkout still works in deployments that haven't
  // configured the Flight Review price yet.
  flightReviewPriceId: string | null;
  appUrl: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getPaymentConfig(): PaymentConfig {
  return {
    stripeSecretKey: requiredEnv("STRIPE_SECRET_KEY"),
    webhookSecret: requiredEnv("STRIPE_WEBHOOK_SECRET"),
    advancedBundlePriceId: requiredEnv("STRIPE_ADVANCED_BUNDLE_PRICE_ID"),
    flightReviewPriceId: process.env.STRIPE_FLIGHT_REVIEW_PRICE_ID ?? null,
    appUrl: requiredEnv("APP_URL").replace(/\/$/, ""),
  };
}

/** Resolves the Stripe price id for a product, throwing if it isn't configured. */
export function priceIdForProduct(product: CheckoutProduct, config: PaymentConfig): string {
  const id = product === FLIGHT_REVIEW_PRODUCT ? config.flightReviewPriceId : config.advancedBundlePriceId;
  if (!id) throw new Error(`Stripe price for ${product} is not configured`);
  return id;
}

export function normalizeCheckoutLocale(locale: unknown): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

export function advancedBundleCheckoutUrls(locale: unknown): {
  successUrl: string;
  cancelUrl: string;
} {
  const safeLocale = normalizeCheckoutLocale(locale);
  const { appUrl } = getPaymentConfig();
  return {
    successUrl: `${appUrl}/${safeLocale}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${safeLocale}/billing/cancelled`,
  };
}
