export const PAID_ACCESS_PRODUCT = "paid_access";

export type PaymentConfig = {
  stripeSecretKey: string;
  webhookSecret: string;
  paidAccessPriceId: string;
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
    paidAccessPriceId: requiredEnv("STRIPE_PAID_ACCESS_PRICE_ID"),
    appUrl: requiredEnv("APP_URL").replace(/\/$/, ""),
  };
}

export function normalizeCheckoutLocale(locale: unknown): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

export function paidAccessCheckoutUrls(locale: unknown): {
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
