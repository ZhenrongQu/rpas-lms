# Pre-Launch Checklist

Status key: ✅ done · ⚠️ partial · ❌ not started

---

## Infrastructure

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Production database | ❌ | SQLite is dev-only. Use Postgres (Supabase / Neon / Railway). Update `DATABASE_URL` and change `provider = "postgresql"` in `prisma/schema.prisma`. Run `prisma migrate deploy`. |
| 2 | `AUTH_SECRET` | ❌ | Generate a real 32-byte secret: `openssl rand -base64 32` |
| 3 | `APP_URL` | ❌ | Set to the live domain, no trailing slash |
| 4 | HTTPS / TLS | ❌ | Ensure deployment platform enforces HTTPS |
| 5 | Prisma migrations | ❌ | Switch from `db push` to `prisma migrate dev` → `prisma migrate deploy` for production. The current dev.db has no migration history. |

---

## Payments (Stripe)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | Stripe live-mode keys | ❌ | Replace `sk_test_*` with `sk_live_*`. Create a live Price in the Stripe dashboard and update `STRIPE_ADVANCED_BUNDLE_PRICE_ID`. |
| 7 | Stripe webhook endpoint | ❌ | Register `https://yourdomain.com/api/payments/webhook` in Stripe dashboard → Webhooks. Event: `checkout.session.completed`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`. |
| 8 | End-to-end payment test | ❌ | Use Stripe test mode + card `4242 4242 4242 4242` to confirm: checkout opens → webhook fires → `Entitlement` row created → session refresh shows PAID tier. |
| 9 | Pricing page | ❌ | No dedicated `/pricing` page exists. Users discover the purchase button only when they hit a locked lesson. Add a pricing page linked from the Services section. |

---

## Email

| # | Item | Status | Notes |
|---|------|--------|-------|
| 10 | Resend account + verified domain | ❌ | Sign up at resend.com, add a sending domain (e.g. `mail.rpasacademy.ca`), set `RESEND_API_KEY` and `EMAIL_FROM`. |
| 11 | Email template | ⚠️ | Current template is plain text/HTML. Consider a branded HTML email. |
| 12 | SMS verification | ❌ | Phone sign-in sends a code but `delivery.ts` doesn't implement SMS. Wire up Twilio or Vonage before enabling phone login. |

---

## Content

| # | Item | Status | Notes |
|---|------|--------|-------|
| 13 | Chinese question bank | ❌ | All 300 questions in `content/question-bank.json` have identical EN/ZH text. Each needs a real Chinese translation in the `"ZH"` field. |
| 14 | Lesson content | ⚠️ | Some modules show "coming soon". Verify all Basic lessons exist; Advanced lessons need content. |
| 15 | Placeholder testimonials | ❌ | The reviews section uses sample quotes. Replace with real ones or remove before launch. |
| 16 | Placeholder contact info | ❌ | Footer has `hello@rpasacademy.example` and `+1 (555) 015-2630`. Replace with real values. |
| 17 | Brand hero image | ❌ | `app/[locale]/page.tsx` shows "Drop your brand hero image here". Add a real image. |

---

## Legal & Compliance

| # | Item | Status | Notes |
|---|------|--------|-------|
| 18 | Privacy Policy | ❌ | Required by Stripe, Google OAuth, and Canadian privacy law (PIPEDA). |
| 19 | Terms of Service | ❌ | Covers refund policy, licence terms, disclaimer of affiliation with Transport Canada. |
| 20 | Cookie / session consent | ❌ | `next-auth` sets an `__Secure-*` session cookie. A consent banner may be required depending on your target jurisdiction. |
| 21 | Refund policy | ❌ | Define and link from checkout. Stripe may require this. |

---

## Security & Reliability

| # | Item | Status | Notes |
|---|------|--------|-------|
| 22 | Rate limiting on auth routes | ✅ | DB-backed fixed-window limiter (`RateLimit` table): `/api/auth/register`, `/api/auth/password/forgot`, `/api/payments/checkout`; plus account+IP lockout on customer and admin login. `/api/auth/code/*` retired (410). |
| 23 | Error monitoring | ❌ | Add Sentry (or similar) to catch runtime exceptions. |
| 24 | Environment variable audit | ❌ | Confirm no secrets exist in `.env` that get committed. `.gitignore` should exclude `.env` (not `.env.example`). |
| 25 | Stripe webhook signature verified | ✅ | `constructEvent` with webhook secret is already implemented. |
| 26 | Webhook idempotency | ✅ | `WebhookEvent` dedupes deliveries, and the event is recorded **only after** the grant succeeds — a failed grant leaves no row so Stripe's retry safely re-runs the idempotent grant (no pay-without-access). |

---

## UX / Polish

| # | Item | Status | Notes |
|---|------|--------|-------|
| 27 | `next/image` for hero | ❌ | Replace `<img>` placeholder with `<Image>` component for optimization. |
| 28 | Favicon / OG image | ❌ | Add `app/favicon.ico` and `app/opengraph-image.png`. |
| 29 | `sitemap.xml` / `robots.txt` | ❌ | Add via `app/sitemap.ts` and `app/robots.ts` in Next.js 15. |
| 30 | Mobile nav (hamburger) | ❌ | Header collapses poorly on small screens. Add a mobile menu. |

---

## To activate local Stripe testing right now

```bash
# 1. Install Stripe CLI (brew install stripe/stripe-cli/stripe)
stripe login

# 2. Create a test product & price in Stripe dashboard, copy the price ID

# 3. Add to .env:
STRIPE_SECRET_KEY=sk_test_...
STRIPE_ADVANCED_BUNDLE_PRICE_ID=price_...
APP_URL=http://localhost:3000

# 4. Forward webhooks and copy the signing secret it prints
stripe listen --forward-to localhost:3000/api/payments/webhook
# → add STRIPE_WEBHOOK_SECRET=whsec_... to .env
```

Then restart the dev server and test with card `4242 4242 4242 4242`.
