# Payment Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Stripe Checkout loop where a one-time purchase grants all paid lesson access through a signature-verified webhook.

**Architecture:** Add database-backed `Payment`, `Entitlement`, and `WebhookEvent` records. Checkout creation is server-authoritative and uses one fixed Stripe Price ID. Browser redirects never grant access; only the Stripe webhook grants `paid_access`, and lesson access checks read database state.

**Tech Stack:** Next.js App Router route handlers, NextAuth session helper, Prisma + SQLite, Stripe Checkout + webhooks, TypeScript, Vitest.

---

## File Structure

- `prisma/schema.prisma`: add payment, entitlement, webhook event models and `User.stripeCustomerId`.
- `.env.example`: document Stripe payment environment variables.
- `vitest.config.ts`: provide deterministic Stripe test env values.
- `src/lib/payments/config.ts`: centralize payment env parsing and product constants.
- `src/lib/payments/stripeClient.ts`: small Stripe wrapper with a test override hook.
- `src/lib/payments/entitlements.ts`: DB source of truth for paid access and webhook grants.
- `src/lib/payments/entitlements.test.ts`: entitlement service tests.
- `app/api/payments/checkout/route.ts`: authenticated Checkout Session creation.
- `app/api/payments/checkout/route.test.ts`: checkout route tests.
- `app/api/payments/webhook/route.ts`: raw-body Stripe webhook handler.
- `app/api/payments/webhook/route.test.ts`: webhook route tests.
- `src/components/payments/PurchaseButton.tsx`: client-side button that posts to checkout and navigates to Stripe.
- `app/[locale]/billing/success/page.tsx`: neutral post-checkout page.
- `app/[locale]/billing/cancelled/page.tsx`: cancellation page.
- `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx`: use DB paid access and render purchase action on locked paid lessons.

---

### Task 1: Add Stripe dependency and environment configuration

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `vitest.config.ts`
- Create: `src/lib/payments/config.ts`
- Create: `src/lib/payments/config.test.ts`

- [ ] **Step 1: Install Stripe**

Run:

```bash
pnpm add stripe
```

Expected: `stripe` appears in `dependencies`; `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write the failing config test**

Create `src/lib/payments/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PAID_ACCESS_PRODUCT,
  getPaymentConfig,
  paidAccessCheckoutUrls,
} from "./config";

describe("payment config", () => {
  it("reads Stripe checkout settings from env", () => {
    const config = getPaymentConfig();
    expect(PAID_ACCESS_PRODUCT).toBe("paid_access");
    expect(config.stripeSecretKey).toBe("sk_test_unit");
    expect(config.webhookSecret).toBe("whsec_unit");
    expect(config.paidAccessPriceId).toBe("price_paid_access_unit");
    expect(config.appUrl).toBe("https://rpas.test");
  });

  it("builds localized success and cancel URLs", () => {
    expect(paidAccessCheckoutUrls("zh")).toEqual({
      successUrl: "https://rpas.test/zh/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://rpas.test/zh/billing/cancelled",
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/payments/config.test.ts
```

Expected: FAIL because `src/lib/payments/config.ts` does not exist.

- [ ] **Step 4: Document env vars**

Add to `.env.example`:

```dotenv
APP_URL="http://localhost:3000"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PAID_ACCESS_PRICE_ID="price_..."
```

- [ ] **Step 5: Add Stripe env to Vitest**

In `vitest.config.ts`, extend `test.env`:

```ts
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      APP_URL: "https://rpas.test",
      STRIPE_SECRET_KEY: "sk_test_unit",
      STRIPE_WEBHOOK_SECRET: "whsec_unit",
      STRIPE_PAID_ACCESS_PRICE_ID: "price_paid_access_unit",
    },
```

- [ ] **Step 6: Implement payment config**

Create `src/lib/payments/config.ts`:

```ts
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
```

- [ ] **Step 7: Run to verify it passes**

Run:

```bash
pnpm exec vitest run src/lib/payments/config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example vitest.config.ts src/lib/payments/config.ts src/lib/payments/config.test.ts
git commit -m "feat(payments): add Stripe payment config"
```

---

### Task 2: Add payment persistence schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update Prisma schema**

In `model User`, add:

```prisma
  stripeCustomerId String?
  payments         Payment[]
  entitlements     Entitlement[]
```

After `ExamSession`, add:

```prisma
model Payment {
  id                      String   @id @default(cuid())
  userId                  String
  user                    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  stripeCheckoutSessionId String   @unique
  stripePaymentIntentId   String?  @unique
  stripeCustomerId        String?
  product                 String
  amountTotal             Int?
  currency                String?
  status                  String
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@index([userId])
  @@index([product])
}

model Entitlement {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  product   String
  source    String
  grantedAt DateTime  @default(now())
  revokedAt DateTime?

  @@index([userId])
  @@index([product])
  @@unique([userId, product])
}

model WebhookEvent {
  id          String   @id
  type        String
  processedAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate Prisma client and sync test schema**

Run:

```bash
pnpm exec prisma generate
pnpm exec prisma db push --force-reset --skip-generate
```

Expected: Prisma client generated and local dev schema accepts the new models. The second command resets the worktree-local dev database only.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(payments): add payment entitlement schema"
```

---

### Task 3: Add entitlement service

**Files:**
- Create: `src/lib/payments/entitlements.ts`
- Create: `src/lib/payments/entitlements.test.ts`

- [ ] **Step 1: Write failing entitlement tests**

Create `src/lib/payments/entitlements.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { grantPaidAccessFromCheckout, hasPaidAccess } from "./entitlements";

describe("payment entitlements", () => {
  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.user.deleteMany();
  });

  it("returns false for free users and true for paid users", async () => {
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
    await prisma.user.create({ data: { id: "u2", email: "u2@test.local", accessTier: "PAID" } });
    expect(await hasPaidAccess("u1")).toBe(false);
    expect(await hasPaidAccess("u2")).toBe(true);
  });

  it("grants paid access from a completed checkout session", async () => {
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
    await grantPaidAccessFromCheckout({
      id: "cs_test_1",
      userId: "u1",
      paymentIntentId: "pi_1",
      customerId: "cus_1",
      amountTotal: 9900,
      currency: "cad",
    });

    expect(await hasPaidAccess("u1")).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("PAID");
    expect(user.stripeCustomerId).toBe("cus_1");
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.entitlement.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/payments/entitlements.test.ts
```

Expected: FAIL because `./entitlements` does not exist.

- [ ] **Step 3: Implement entitlement service**

Create `src/lib/payments/entitlements.ts`:

```ts
import { prisma } from "../db";
import { PAID_ACCESS_PRODUCT } from "./config";

export type CheckoutGrant = {
  id: string;
  userId: string;
  paymentIntentId?: string | null;
  customerId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
};

export async function hasPaidAccess(userId: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId_product: { userId, product: PAID_ACCESS_PRODUCT } },
    select: { revokedAt: true },
  });
  if (entitlement && !entitlement.revokedAt) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessTier: true },
  });
  return user?.accessTier === "PAID";
}

export async function grantPaidAccessFromCheckout(grant: CheckoutGrant): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { stripeCheckoutSessionId: grant.id },
      create: {
        userId: grant.userId,
        stripeCheckoutSessionId: grant.id,
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        product: PAID_ACCESS_PRODUCT,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
      update: {
        stripePaymentIntentId: grant.paymentIntentId ?? null,
        stripeCustomerId: grant.customerId ?? null,
        amountTotal: grant.amountTotal ?? null,
        currency: grant.currency ?? null,
        status: "paid",
      },
    });

    await tx.entitlement.upsert({
      where: { userId_product: { userId: grant.userId, product: PAID_ACCESS_PRODUCT } },
      create: {
        userId: grant.userId,
        product: PAID_ACCESS_PRODUCT,
        source: "stripe_checkout",
      },
      update: {
        source: "stripe_checkout",
        revokedAt: null,
      },
    });

    await tx.user.update({
      where: { id: grant.userId },
      data: {
        accessTier: "PAID",
        stripeCustomerId: grant.customerId ?? undefined,
      },
    });
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
pnpm exec vitest run src/lib/payments/entitlements.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/entitlements.ts src/lib/payments/entitlements.test.ts
git commit -m "feat(payments): add paid access entitlement service"
```

---

### Task 4: Add Stripe wrapper and checkout route

**Files:**
- Create: `src/lib/payments/stripeClient.ts`
- Create: `app/api/payments/checkout/route.ts`
- Create: `app/api/payments/checkout/route.test.ts`

- [ ] **Step 1: Write failing checkout route tests**

Create `app/api/payments/checkout/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { __setStripeClientForTests } from "../../../../src/lib/payments/stripeClient";
import { POST } from "./route";

describe("POST /api/payments/checkout", () => {
  beforeEach(async () => {
    __setStripeClientForTests(null);
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
  });

  it("rejects guests", async () => {
    const res = await POST(new Request("http://test/api/payments/checkout", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates a Stripe Checkout Session using server configured price and metadata", async () => {
    const calls: unknown[] = [];
    __setStripeClientForTests({
      checkout: {
        sessions: {
          create: async (params: unknown) => {
            calls.push(params);
            return { url: "https://checkout.stripe.test/session" };
          },
        },
      },
    });

    const res = await POST(
      new Request("http://test/api/payments/checkout", {
        method: "POST",
        headers: { "x-test-user-id": "u1" },
        body: JSON.stringify({ locale: "zh", price: "price_client_tamper" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(calls).toEqual([
      expect.objectContaining({
        mode: "payment",
        client_reference_id: "u1",
        success_url: "https://rpas.test/zh/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://rpas.test/zh/billing/cancelled",
        metadata: { userId: "u1", product: "paid_access" },
        line_items: [{ price: "price_paid_access_unit", quantity: 1 }],
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
pnpm exec vitest run app/api/payments/checkout/route.test.ts
```

Expected: FAIL because checkout route and Stripe wrapper do not exist.

- [ ] **Step 3: Implement Stripe wrapper**

Create `src/lib/payments/stripeClient.ts`:

```ts
import Stripe from "stripe";
import { getPaymentConfig } from "./config";

type StripeLike = Pick<Stripe, "checkout" | "webhooks">;

let testStripeClient: StripeLike | null = null;

export function getStripeClient(): StripeLike {
  if (testStripeClient) return testStripeClient;
  return new Stripe(getPaymentConfig().stripeSecretKey);
}

export function __setStripeClientForTests(client: StripeLike | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test override only");
  testStripeClient = client;
}
```

- [ ] **Step 4: Implement checkout route**

Create `app/api/payments/checkout/route.ts`:

```ts
import { currentAccount } from "../../exam/sessionAuth";
import { getPaymentConfig, paidAccessCheckoutUrls, PAID_ACCESS_PRODUCT } from "../../../../src/lib/payments/config";
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
```

- [ ] **Step 5: Run to verify it passes**

Run:

```bash
pnpm exec vitest run app/api/payments/checkout/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments/stripeClient.ts app/api/payments/checkout/route.ts app/api/payments/checkout/route.test.ts
git commit -m "feat(payments): create paid access checkout sessions"
```

---

### Task 5: Add Stripe webhook route

**Files:**
- Create: `app/api/payments/webhook/route.ts`
- Create: `app/api/payments/webhook/route.test.ts`

- [ ] **Step 1: Write failing webhook route tests**

Create `app/api/payments/webhook/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { __setStripeClientForTests } from "../../../../src/lib/payments/stripeClient";
import { POST } from "./route";

const completedEvent = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      payment_status: "paid",
      metadata: { userId: "u1", product: "paid_access" },
      payment_intent: "pi_1",
      customer: "cus_1",
      amount_total: 9900,
      currency: "cad",
    },
  },
};

describe("POST /api/payments/webhook", () => {
  beforeEach(async () => {
    __setStripeClientForTests(null);
    await prisma.webhookEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.entitlement.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.create({ data: { id: "u1", email: "u1@test.local", accessTier: "FREE" } });
  });

  it("rejects invalid signatures", async () => {
    __setStripeClientForTests({
      checkout: { sessions: { create: async () => ({ url: "" }) } },
      webhooks: { constructEvent: () => { throw new Error("bad signature"); } },
    });
    const res = await POST(new Request("http://test/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "bad" },
      body: "{}",
    }));
    expect(res.status).toBe(400);
  });

  it("grants paid access for completed checkout sessions and is idempotent", async () => {
    __setStripeClientForTests({
      checkout: { sessions: { create: async () => ({ url: "" }) } },
      webhooks: { constructEvent: () => completedEvent },
    });

    const request = () => new Request("http://test/api/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: JSON.stringify(completedEvent),
    });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: "u1" } });
    expect(user.accessTier).toBe("PAID");
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.entitlement.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
pnpm exec vitest run app/api/payments/webhook/route.test.ts
```

Expected: FAIL because webhook route does not exist.

- [ ] **Step 3: Implement webhook route**

Create `app/api/payments/webhook/route.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../src/lib/db";
import { PAID_ACCESS_PRODUCT, getPaymentConfig } from "../../../../src/lib/payments/config";
import { grantPaidAccessFromCheckout } from "../../../../src/lib/payments/entitlements";
import { getStripeClient } from "../../../../src/lib/payments/stripeClient";

type CheckoutSessionLike = {
  id: string;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
};

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  let event: { id: string; type: string; data: { object: unknown } };
  try {
    event = getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      getPaymentConfig().webhookSecret,
    ) as { id: string; type: string; data: { object: unknown } };
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ received: true }, { status: 200 });
    }
    throw error;
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true }, { status: 200 });
  }

  const session = event.data.object as CheckoutSessionLike;
  const userId = session.metadata?.userId;
  const product = session.metadata?.product;
  if (!userId || product !== PAID_ACCESS_PRODUCT || session.payment_status !== "paid") {
    return Response.json({ received: true }, { status: 200 });
  }

  await grantPaidAccessFromCheckout({
    id: session.id,
    userId,
    paymentIntentId: idOf(session.payment_intent),
    customerId: idOf(session.customer),
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
  });

  return Response.json({ received: true }, { status: 200 });
}
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
pnpm exec vitest run app/api/payments/webhook/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/payments/webhook/route.ts app/api/payments/webhook/route.test.ts
git commit -m "feat(payments): grant access from Stripe webhook"
```

---

### Task 6: Wire paid lesson access and purchase UI

**Files:**
- Create: `src/components/payments/PurchaseButton.tsx`
- Modify: `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx`
- Create: `app/[locale]/billing/success/page.tsx`
- Create: `app/[locale]/billing/cancelled/page.tsx`

- [ ] **Step 1: Implement purchase button**

Create `src/components/payments/PurchaseButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function PurchaseButton({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className="btn-primary" onClick={startCheckout} disabled={loading}>
      {loading ? "Opening checkout..." : "Unlock paid lessons"}
    </button>
  );
}
```

- [ ] **Step 2: Update lesson page access check**

In `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx`, add imports:

```ts
import PurchaseButton from '@/components/payments/PurchaseButton';
import { hasPaidAccess } from '@/lib/payments/entitlements';
```

Replace tier derivation with:

```ts
  const isPaid = userId ? await hasPaidAccess(userId) : false;
  const tier: AccessTier = isPaid ? 'PAID' : userId ? 'FREE' : 'GUEST';
```

Inside the locked gate, after locked body, add:

```tsx
          {userId ? (
            <PurchaseButton locale={locale} />
          ) : (
            <Link href={`/${locale}/signin`} className="btn-primary">
              {t('auth.signIn')}
            </Link>
          )}
```

- [ ] **Step 3: Add success page**

Create `app/[locale]/billing/success/page.tsx`:

```tsx
import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export default async function BillingSuccessPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="module-landing">
      <div className="hud-panel locked-gate">
        <div className="locked-title">Payment received</div>
        <div className="locked-body">
          Stripe is confirming your purchase. Paid lessons unlock as soon as the webhook is processed.
        </div>
        <Link href={`/${locale}/learn`} className="btn-primary">Back to lessons</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add cancelled page**

Create `app/[locale]/billing/cancelled/page.tsx`:

```tsx
import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export default async function BillingCancelledPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="module-landing">
      <div className="hud-panel locked-gate">
        <div className="locked-title">Checkout cancelled</div>
        <div className="locked-body">No payment was completed and your access was not changed.</div>
        <Link href={`/${locale}/learn`} className="btn-primary">Back to lessons</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. If translation key `auth.signIn` does not exist, replace the sign-in label with plain `"Sign in"` to keep this task scoped.

- [ ] **Step 6: Commit**

```bash
git add src/components/payments/PurchaseButton.tsx app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx app/[locale]/billing/success/page.tsx app/[locale]/billing/cancelled/page.tsx
git commit -m "feat(payments): add paid lesson checkout UI"
```

---

### Task 7: Full verification

**Files:** none

- [ ] **Step 1: Run focused payment tests**

Run:

```bash
pnpm exec vitest run src/lib/payments/config.test.ts src/lib/payments/entitlements.test.ts app/api/payments/checkout/route.test.ts app/api/payments/webhook/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Optional local Stripe smoke**

With real test-mode Stripe env values in `.env`, run:

```bash
pnpm dev
```

In another terminal:

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Expected: completing Checkout grants `User.accessTier = "PAID"` and creates one `Payment`, one active `Entitlement`, and one `WebhookEvent`.

---

## Self-review

- **Spec coverage:** Checkout creation is Task 4; webhook verification/idempotency/grant is Task 5; persistence schema is Task 2; DB paid access is Task 3 and Task 6; success/cancel pages and purchase action are Task 6; no refund behavior is included.
- **Placeholder scan:** No unfinished placeholder markers; each code-bearing step includes concrete snippets and commands.
- **Type consistency:** Product key is `paid_access` everywhere; env names match spec; route paths match app structure; Prisma compound key `userId_product` follows `@@unique([userId, product])`.
