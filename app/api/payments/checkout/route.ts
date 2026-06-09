import { currentAccount } from "../../exam/sessionAuth";
import {
  getPaymentConfig,
  paidAccessCheckoutUrls,
  PAID_ACCESS_PRODUCT,
} from "../../../../src/lib/payments/config";
import { hasPaidAccess } from "../../../../src/lib/payments/entitlements";
import { getStripeClient } from "../../../../src/lib/payments/stripeClient";

export async function POST(req: Request): Promise<Response> {
  const account = await currentAccount(req);
  if (!account.userId) return Response.json({ error: "auth required" }, { status: 401 });

  let body: { locale?: unknown } = {};
  try {
    body = (await req.json()) as { locale?: unknown };
  } catch {
    body = {};
  }

  const { successUrl, cancelUrl } = paidAccessCheckoutUrls(body.locale);
  if (await hasPaidAccess(account.userId)) return Response.json({ url: successUrl }, { status: 200 });

  const config = getPaymentConfig();
  const session = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: config.paidAccessPriceId, quantity: 1 }],
    client_reference_id: account.userId,
    metadata: { userId: account.userId, product: PAID_ACCESS_PRODUCT },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) return Response.json({ error: "checkout unavailable" }, { status: 502 });
  return Response.json({ url: session.url }, { status: 200 });
}
