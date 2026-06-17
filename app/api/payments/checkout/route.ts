import { currentAccount } from "../../exam/sessionAuth";
import {
  getPaymentConfig,
  advancedBundleCheckoutUrls,
  priceIdForProduct,
  ADVANCED_BUNDLE_PRODUCT,
  FLIGHT_REVIEW_PRODUCT,
  type CheckoutProduct,
} from "../../../../src/lib/payments/config";
import {
  hasPaidAccess,
  hasFlightReviewEntitlement,
} from "../../../../src/lib/payments/entitlements";
import { getStripeClient } from "../../../../src/lib/payments/stripeClient";

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount(req);
  if (!account.userId) return Response.json({ error: "auth required" }, { status: 401 });

  let body: { locale?: unknown; product?: unknown } = {};
  try {
    body = (await req.json()) as { locale?: unknown; product?: unknown };
  } catch {
    body = {};
  }

  // Default to paid access for backward compatibility (the lesson paywall sends no product).
  const product: CheckoutProduct =
    body.product === FLIGHT_REVIEW_PRODUCT ? FLIGHT_REVIEW_PRODUCT : ADVANCED_BUNDLE_PRODUCT;

  let successUrl: string;
  let cancelUrl: string;
  let priceId: string;
  try {
    const urls = advancedBundleCheckoutUrls(body.locale);
    successUrl = urls.successUrl;
    cancelUrl = urls.cancelUrl;
    priceId = priceIdForProduct(product, getPaymentConfig());
  } catch {
    return Response.json({ error: "payments not configured" }, { status: 503 });
  }

  // Already entitled → skip checkout and send them to the success page.
  const alreadyEntitled =
    product === FLIGHT_REVIEW_PRODUCT
      ? await hasFlightReviewEntitlement(account.userId)
      : await hasPaidAccess(account.userId);
  if (alreadyEntitled) return Response.json({ url: successUrl }, { status: 200 });

  const session = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: account.userId,
    metadata: { userId: account.userId, product },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) return Response.json({ error: "checkout unavailable" }, { status: 502 });
  return Response.json({ url: session.url }, { status: 200 });
}
