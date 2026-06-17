# Payment Closed Loop

Date: 2026-06-08
Project: `/Users/quzhenrong/rpas-lms`
Status: Approved design for implementation

## Goal

Add a complete Stripe payment loop for one-time purchases:

- A logged-in user can start Stripe Checkout for paid access.
- The browser redirect never grants access.
- Only a signature-verified Stripe webhook can grant `PAID` access.
- A single purchase unlocks all paid lessons.
- Refund, dispute, and chargeback handling are intentionally out of scope for this pass.

## Scope

In scope:

- Stripe Checkout Session creation.
- Stripe webhook signature verification and idempotent event processing.
- `Payment`, `Entitlement`, and `WebhookEvent` persistence.
- Paid lesson access checks against the database.
- Basic success and cancelled pages.
- Purchase affordance from locked lesson/course surfaces.
- Tests for checkout creation, webhook handling, idempotency, and paid lesson access.

Out of scope:

- Refund or chargeback revocation.
- Subscriptions, multiple products, coupons, promo codes, trials, or metered billing.
- Stripe Customer portal.
- Tax configuration beyond enabling Stripe Checkout to use the configured Price.
- Client-side Stripe Elements or Payment Element.

## Product Model

There is one purchasable product: full paid access for the LMS.

- Product key: `paid_access`
- Purchase mode: one-time payment
- Stripe price: `STRIPE_ADVANCED_BUNDLE_PRICE_ID`
- Resulting user state: `User.accessTier = "PAID"`
- Resulting entitlement: active `Entitlement(product = "paid_access")`

The client never sends amount, currency, product name, or price id. Those values are selected by the server from environment configuration and Stripe Checkout data.

## User Flow

1. A signed-in `FREE` user opens a paid lesson.
2. The lesson page checks the user's paid entitlement in the database.
3. If the user does not have paid access, the page renders the existing locked gate with a purchase action.
4. The purchase action posts to `POST /api/payments/checkout`.
5. The route creates a Stripe Checkout Session and returns its hosted Checkout URL.
6. The browser navigates to Stripe Checkout.
7. Stripe redirects the browser to either:
   - `/{locale}/billing/success?session_id={CHECKOUT_SESSION_ID}`
   - `/{locale}/billing/cancelled`
8. The success page displays a neutral completion state. It does not grant access.
9. Stripe sends `checkout.session.completed` to `POST /api/payments/webhook`.
10. The webhook verifies the Stripe signature, deduplicates by event id, writes payment records, grants `paid_access`, and updates the user to `PAID`.
11. Paid lessons become visible because future access checks read database state.

## API Design

### `POST /api/payments/checkout`

Auth:

- Requires a signed-in user.
- Uses the existing server auth/session helper.

Input:

- Optional `locale` for return URLs.
- No price, product, or amount fields are accepted.

Behavior:

- If unauthenticated, returns `401`.
- If the user is already paid, returns a redirect URL to the success page or an idempotent success response.
- Otherwise creates a Stripe Checkout Session:
  - `mode: "payment"`
  - `line_items[0].price: STRIPE_ADVANCED_BUNDLE_PRICE_ID`
  - `line_items[0].quantity: 1`
  - `client_reference_id: user.id`
  - `metadata.userId: user.id`
  - `metadata.product: "paid_access"`
  - `success_url` and `cancel_url` derived from `APP_URL` and locale.
- Returns `{ url }`.

### `POST /api/payments/webhook`

Auth:

- No app session auth.
- Requires valid Stripe signature using `STRIPE_WEBHOOK_SECRET`.
- Uses the raw request body for signature verification.

Handled event:

- `checkout.session.completed`

Behavior:

- Invalid signature or unreadable event returns `400`.
- Already-processed event id returns `200` without repeating writes.
- Unknown event types are recorded as processed and return `200`.
- A completed checkout session grants access only when:
  - `metadata.userId` exists.
  - `metadata.product === "paid_access"`.
  - Session payment status is paid or the event is otherwise Stripe-confirmed as completed for payment mode.
- The handler writes all state changes in one transaction:
  - create `WebhookEvent`
  - create or update `Payment`
  - create or update active `Entitlement`
  - update `User.accessTier` to `PAID`

## Data Model

Add to `User`:

- `stripeCustomerId String?`
- Relations to payments and entitlements.

Add `Payment`:

- `id String @id @default(cuid())`
- `userId String`
- `stripeCheckoutSessionId String @unique`
- `stripePaymentIntentId String? @unique`
- `stripeCustomerId String?`
- `product String`
- `amountTotal Int?`
- `currency String?`
- `status String`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Add `Entitlement`:

- `id String @id @default(cuid())`
- `userId String`
- `product String`
- `source String`
- `grantedAt DateTime @default(now())`
- `revokedAt DateTime?`
- Unique active entitlement is enforced at application level for SQLite compatibility.

Add `WebhookEvent`:

- `id String @id`
- `type String`
- `processedAt DateTime @default(now())`

The schema keeps `revokedAt` even though refunds are out of scope, because it is part of the entitlement shape and does not add behavior by itself.

## Access Control

Paid lesson access must use database state, not only JWT claims.

Add a small entitlement service that exposes:

- `hasPaidAccess(userId: string): Promise<boolean>`
- `grantPaidAccessFromCheckout(sessionLike): Promise<void>`

Lesson pages convert session state to an access tier as follows:

- no user id: `GUEST`
- user id with active `paid_access` entitlement or current DB `accessTier = "PAID"`: `PAID`
- otherwise: `FREE`

The DB `accessTier` fallback preserves compatibility with existing paid users while entitlement records become the new source of truth.

## UI

Keep UI minimal and consistent with the current lesson surfaces.

- Locked lesson page adds a purchase button.
- The button posts to checkout and navigates to the returned URL.
- Success page tells the user payment is being confirmed and links back to learning.
- Cancelled page lets the user return to the paid lesson/course area.

No pricing copy is hard-coded unless it already exists in Stripe Checkout. The app can describe the product as paid access, but Stripe remains the payment/pricing authority.

## Configuration

Required environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_ADVANCED_BUNDLE_PRICE_ID`
- `APP_URL`

Optional:

- `STRIPE_API_VERSION` only if the project later wants to pin a different Stripe API version.

`.env.example` documents placeholders only. Real secrets stay out of git.

## Testing

Unit/integration tests cover:

- Checkout route rejects unauthenticated requests.
- Checkout route creates a session with the configured price id and user metadata.
- Webhook route rejects invalid signatures.
- Webhook grants paid access for `checkout.session.completed`.
- Webhook is idempotent by Stripe event id.
- Paid lesson access helper reads DB entitlement/access tier.

Stripe network calls are wrapped behind a small local module so tests can stub the local interface rather than call Stripe.

## Rollout

1. Add database schema and generate Prisma client.
2. Add payment config and Stripe wrapper.
3. Add checkout route.
4. Add webhook route and entitlement service.
5. Wire lesson access checks to DB.
6. Add minimal success/cancel pages and purchase button.
7. Verify with tests and a local Stripe CLI webhook smoke when credentials are available.

## References

- Stripe Checkout Session API: server-created sessions with fixed Price IDs, metadata, and `client_reference_id`.
- Stripe webhook signature verification: verify `Stripe-Signature` against the raw request body using the endpoint secret.
