# Credential & Payment Security Hardening

Date: 2026-06-08
Project: `/Users/quzhenrong/rpas-lms`
Status: Draft for user review — **design only, implement later**

## Goal

Raise credential-protection strength and secure the upcoming **in-app course purchase**
flow, so that:

- Stored passwords resist offline cracking even if the database is fully exfiltrated.
- Online attacks (brute force, credential stuffing) are throttled and detectable.
- The `FREE → PAID` entitlement can only be granted by a **verified payment**, never
  forged or replayed by a client.
- Account takeover is harder and its blast radius (paid content, payment data) is limited.

This is a forward-looking hardening plan triggered by the decision to charge users for
courses. Money + accounts raise the value of both an account takeover and of tampering
with entitlements, so credential storage and the payment/entitlement path are designed
together.

## Context (current state, post password-auth redesign on `main`)

- **Password hashing:** `bcryptjs` cost 10 — [src/lib/auth/password.ts](../../../src/lib/auth/password.ts).
- **Login:** password against one identifier (email/phone/username); requires `emailVerifiedAt`
  — [src/lib/auth/localAccount.ts](../../../src/lib/auth/localAccount.ts).
- **Sessions:** NextAuth **JWT** strategy — [auth.ts](../../../auth.ts).
- **Entitlement:** `User.accessTier` (`FREE` default) in DB, surfaced into the JWT/session.
- **Gaps:** no login rate limiting / lockout, no MFA, no breached-password check, no
  payment integration, secrets in `.env`, dev DB is SQLite (`prisma/dev.db`).

## Threat model

| Threat | Current exposure | Mitigation (this plan) |
|---|---|---|
| DB exfiltration → offline password cracking | bcrypt(10), salt in DB | Argon2id (memory-hard) + **pepper** held outside DB (§A) |
| Online brute force / credential stuffing | none | Rate limit + lockout + breached-password check (§B) |
| Account takeover → access paid content / payment fraud | password only | MFA + step-up auth on sensitive actions (§C) |
| Forged/replayed entitlement (`FREE→PAID` without paying) | accessTier trusted from JWT | Server-authoritative checkout + webhook-only grant (§E) |
| Session/token theft | long-lived JWT | Short TTL, rotation, secure cookies, token version (§D) |
| Card data handling / PCI scope | n/a yet | Tokenized processor, never touch PAN (§E) |
| Secret leakage (pepper, keys) | `.env` in repo workflow | Secrets manager + rotation (§F) |

## Scope

**In scope:** password storage, login/account defenses, MFA & step-up, session hardening,
payment & entitlement integrity, secrets/key management, PII at rest.

**Out of scope (note for later):** network/infra hardening, a full PCI audit program,
fraud scoring, production email-provider selection, password reset (separate spec).

---

## Design

### A. Password storage — Argon2id + pepper (algorithm-agnostic, backward compatible)

- Replace `bcryptjs` with **`@node-rs/argon2`** (Argon2id; Rust binding, no node-gyp
  pain). OWASP params: `m = 19456 KiB (19 MiB)`, `t = 2`, `p = 1` (tune to ~250–500 ms
  on prod hardware).
- **Pepper:** apply `HMAC-SHA256(password, PEPPER)` **before** Argon2id. `PEPPER` lives in
  a secrets manager, **never in the DB or git**, so a DB-only leak can't be cracked.
  Versioned (`pepperVersion`) to allow rotation.
- **Backward compatible verify:** `verifyPassword` inspects the stored hash prefix —
  `$2a/$2b` → bcrypt path; `$argon2id$` → Argon2 path. On a **successful** login with a
  legacy bcrypt hash, transparently **re-hash** with Argon2id+pepper and update the row
  (rehash-on-login). No forced password reset, no flag day.

### B. Login & account defenses

- **Rate limiting + lockout:** per-IP and per-account sliding window; exponential backoff;
  temporary lockout after N failures (e.g. 5 / 15 min). Store: in-memory for dev, a shared
  store (Upstash/Redis) for prod.
- **Breached-password check:** HaveIBeenPwned range API (k-anonymity — send only the first
  5 chars of the SHA-1) at registration and password change; reject known-breached.
- **Password policy:** min length 12; `zxcvbn` strength ≥ 3.
- **Enumeration-safe:** keep generic errors (already done); constant-time compare handled
  by the KDF. Optional: Cloudflare Turnstile after a failure threshold.

### C. MFA & step-up auth (because of payments)

- **Phase 1 MFA:** opt-in **TOTP** (`otplib`); recovery codes stored hashed.
- **Step-up re-auth** required for: making a purchase, changing email/password, disabling
  MFA. (Re-prompt password/MFA even within a valid session.)
- **Longer term:** **WebAuthn / passkeys** (passwordless) — strongest option, recommended
  given payments. NextAuth-compatible.

### D. Session & token hardening

- Strong `AUTH_SECRET` (32+ random bytes) from the secrets manager; rotate.
- Short JWT lifetime + refresh; cookies `httpOnly`, `Secure`, `SameSite=Lax` (`Strict` for
  sensitive flows).
- Add a `tokenVersion` claim; bump it on password/MFA change to **invalidate existing
  sessions**.
- **Do not trust `accessTier` from a possibly-stale JWT** for gating paid content or
  purchases — verify the entitlement against the DB at point of access (or use a
  short-lived signed entitlement claim). Critical once money is involved.

### E. Payment & entitlement integrity (new — critical)

- **Provider: Stripe (decided).** PCI-compliant; **never handle raw card data** — use
  Stripe Checkout / Payment Element (tokenized; keeps us in the lightest **SAQ-A** scope).
  Sales tax / VAT to be handled via **Stripe Tax** (we are the merchant of record).
- **Server-authoritative pricing:** the client never sends a price or tier. The server
  creates the Checkout Session referencing **fixed Stripe Price IDs**.
- **Entitlement is granted only by a signature-verified, idempotent webhook**
  (`checkout.session.completed` / `payment_intent.succeeded`) — **not** the browser
  redirect. Verify `stripe-signature`, dedupe by event id, reject replays.
- Persist `Payment` + `Entitlement` rows; write the `FREE→PAID` transition **only** from
  the webhook handler; keep an audit log.
- Handle **refunds/chargebacks** → revoke entitlement.
- Store only references (`stripeCustomerId`, `paymentIntentId`) — never card numbers.

### F. Secrets & key management

- Move `PEPPER`, `AUTH_SECRET`, Stripe keys, OAuth secrets into a secrets manager
  (Doppler / Vault / cloud KMS). Separate keys per environment; defined rotation policy;
  nothing sensitive committed.

### G. PII & data at rest

- Prod: migrate **SQLite → Postgres**; enable storage/disk encryption.
- Optionally app-encrypt phone numbers (AES-256-GCM, key in KMS) if the threat model
  warrants; preserve uniqueness lookups via a blind index.

---

## Phased rollout (priority order)

- **Phase 0 — Credential hardening** (no new product deps): Argon2id+pepper with
  rehash-on-login, strong `AUTH_SECRET` + secure cookies, login rate limiting + lockout.
- **Phase 1 — Payments** (required before charging anyone): Stripe integration,
  server-authoritative checkout, webhook-driven entitlement, refund→revoke, audit log.
- **Phase 2 — Account resilience:** breached-password + policy, session invalidation on
  credential change, entitlement verified at access (not from JWT).
- **Phase 3 — MFA:** TOTP + recovery codes + step-up on purchase/credential change.
- **Phase 4 — Advanced:** passkeys/WebAuthn, PII encryption, Postgres migration.

## Data-model changes (later)

- `User`: `+ stripeCustomerId?`, `+ tokenVersion Int @default(0)`, `+ pepperVersion?`.
- New `Payment(id, userId, stripePaymentIntentId @unique, amount, currency, status, createdAt)`.
- New `Entitlement(id, userId, product, source, grantedAt, revokedAt?)`.
- New `MfaCredential(id, userId, type, secretEnc/hashed, recoveryCodesHashed, createdAt)`.
- New `LoginAttempt(key @unique, count, windowStart, lockedUntil?)` (or external store).
- New `WebhookEvent(id @unique, type, processedAt)` for webhook idempotency.

## Affected / new files (later implementation)

- [src/lib/auth/password.ts](../../../src/lib/auth/password.ts) — algo-agnostic hash/verify, pepper, `needsRehash`.
- [src/lib/auth/localAccount.ts](../../../src/lib/auth/localAccount.ts) — rehash-on-login, lockout integration.
- [auth.ts](../../../auth.ts) — `tokenVersion`, step-up, session/JWT callbacks.
- New: `src/lib/auth/rateLimit.ts`, `src/lib/auth/breachedPassword.ts`, `src/lib/auth/mfa.ts`.
- New: `src/lib/payments/stripe.ts`, `app/api/payments/checkout/route.ts`, `app/api/payments/webhook/route.ts`.
- [prisma/schema.prisma](../../../prisma/schema.prisma) — models above.
- Env/secrets: `PEPPER`, `AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs.

## Open decisions (need input before implementation)

1. ~~**Payment provider**~~ → **DECIDED: Stripe** (Stripe Checkout/Payment Element,
   webhook-driven entitlement, Stripe Tax for VAT/sales tax).
2. **MFA path:** TOTP first, or go straight to passkeys?
3. **Secrets manager** choice (Doppler / Vault / cloud KMS).
4. **Prod database / Postgres** migration timing.
5. **Pepper rotation** mechanism (single vs versioned keys).

## References

- OWASP Cheat Sheets: Password Storage, Authentication, Session Management, MFA.
- Stripe: security best practices, webhook signature verification, PCI SAQ-A.
