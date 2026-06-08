# Credential Hardening (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen password storage and login resilience with no new product dependencies — Argon2id + pepper hashing (backward compatible with existing bcrypt hashes, upgraded on next login), per-account login rate limiting + lockout, and short-lived JWT sessions.

**Architecture:** [src/lib/auth/password.ts](../../../src/lib/auth/password.ts) becomes algorithm-agnostic: it hashes new passwords with Argon2id over an HMAC "pepper", verifies both legacy bcrypt and Argon2id hashes, and reports when a hash should be upgraded. `authorizeLocalPasswordLogin` in [src/lib/auth/localAccount.ts](../../../src/lib/auth/localAccount.ts) consults an in-memory rate limiter before checking a password, records failures, clears them on success, and transparently re-hashes legacy passwords. Session lifetime is centralized in a small config module.

**Tech Stack:** TypeScript, NextAuth v5 (JWT), Prisma + SQLite, `@node-rs/argon2`, `bcryptjs` (legacy verify only), Vitest. Pepper/secret via env (`PEPPER`, `AUTH_SECRET`).

**Reference design:** [../specs/2026-06-08-credential-payment-security-hardening-design.md](../specs/2026-06-08-credential-payment-security-hardening-design.md) — covers §A (password storage), §B (login defenses), §D (session hardening). Breached-password checks, password policy, and MFA are **out of scope for Phase 0** (Phases 2–3).

**Package manager note:** the repo uses **pnpm** (`vitest.globalSetup.ts` calls `pnpm exec`). Commands below use `pnpm`; adjust if your environment differs.

---

### Task 1: Add Argon2id dependency and PEPPER configuration

**Files:**
- Modify: `package.json` (add `@node-rs/argon2`)
- Modify: `.env.example`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install the Argon2 binding**

Run: `pnpm add @node-rs/argon2`
Expected: `@node-rs/argon2` is added under `dependencies`; lockfile updated.

- [ ] **Step 2: Document PEPPER in `.env.example`**

Add this line after the `AUTH_SECRET` line:

```
PEPPER="generate-with: openssl rand -base64 32"
```

- [ ] **Step 3: Inject PEPPER into the test environment**

In `vitest.config.ts`, add `PEPPER` to `test.env`:

```ts
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      PEPPER: "test-pepper-test-pepper-test-pepper-0000",
    },
```

- [ ] **Step 4: Set PEPPER in your local `.env` (not committed)**

Run: `printf 'PEPPER="%s"\n' "$(openssl rand -base64 32)" >> .env`
Expected: `.env` now has a `PEPPER` line.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example vitest.config.ts
git commit -m "chore(auth): add @node-rs/argon2 dep and PEPPER config"
```

---

### Task 2: Argon2id + pepper hashing with backward-compatible verify

**Files:**
- Modify: `src/lib/auth/password.ts`
- Create: `src/lib/auth/password.test.ts`
- Modify: `src/lib/auth/localAccount.test.ts` (line ~40 assertion)

- [ ] **Step 1: Write the failing tests** — `src/lib/auth/password.test.ts`

```ts
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with Argon2id and verifies the original password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("still verifies legacy bcrypt hashes (created without pepper)", async () => {
    const legacy = await bcrypt.hash("correct-horse", 10);
    expect(await verifyPassword("correct-horse", legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
  });

  it("flags legacy bcrypt hashes for rehash but not Argon2id hashes", async () => {
    const legacy = await bcrypt.hash("x", 10);
    const modern = await hashPassword("x");
    expect(needsRehash(legacy)).toBe(true);
    expect(needsRehash(modern)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/password.test.ts`
Expected: FAIL — `needsRehash` is not exported and hashes are bcrypt, not `$argon2id$`.

- [ ] **Step 3: Implement** `src/lib/auth/password.ts` (replace the whole file)

```ts
import { createHmac } from "node:crypto";
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// OWASP Argon2id baseline; raise memoryCost on stronger production hardware.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

// Application-level "pepper": an HMAC keyed by a secret kept OUT of the database,
// so a database-only leak cannot be brute-forced offline.
function pepper(plain: string): string {
  const secret = process.env.PEPPER;
  if (!secret) throw new Error("PEPPER is not configured");
  return createHmac("sha256", secret).update(plain, "utf8").digest("base64");
}

export function hashPassword(plain: string): Promise<string> {
  return argon2Hash(pepper(plain), ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (hash.startsWith("$argon2")) {
    return argon2Verify(hash, pepper(plain));
  }
  // Legacy bcrypt hashes were produced from the un-peppered password.
  return bcrypt.compare(plain, hash);
}

export function needsRehash(hash: string): boolean {
  // Upgrade anything that is not current-scheme Argon2id on next successful login.
  return !hash.startsWith("$argon2id$");
}
```

- [ ] **Step 4: Update the one bcrypt assertion in `src/lib/auth/localAccount.test.ts`**

Keep the existing `import bcrypt from "bcryptjs";` (Task 3 reuses it) and **add** at the top:

```ts
import { verifyPassword } from "./password";
```

Then change this line (in the "registers a pending user…" test):

```ts
    expect(await bcrypt.compare("correct-password", user.hashedPassword ?? "")).toBe(true);
```

to:

```ts
    expect(user.hashedPassword?.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("correct-password", user.hashedPassword ?? "")).toBe(true);
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/password.test.ts src/lib/auth/localAccount.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts src/lib/auth/localAccount.test.ts
git commit -m "feat(auth): Argon2id + pepper hashing with bcrypt-compatible verify"
```

---

### Task 3: Rehash legacy passwords on successful login

**Files:**
- Modify: `src/lib/auth/localAccount.ts`
- Modify: `src/lib/auth/localAccount.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the `describe` block in `src/lib/auth/localAccount.test.ts`

```ts
  it("upgrades a legacy bcrypt password to Argon2id on successful login", async () => {
    const user = await prisma.user.create({
      data: {
        email: "legacy@example.com",
        hashedPassword: await bcrypt.hash("correct-password", 10),
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "FREE",
      },
    });

    await expect(
      authorizeLocalPasswordLogin({ email: "legacy@example.com", password: "correct-password" }),
    ).resolves.toMatchObject({ id: user.id });

    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded?.hashedPassword?.startsWith("$argon2id$")).toBe(true);

    // The upgraded hash still authenticates.
    await expect(
      authorizeLocalPasswordLogin({ email: "legacy@example.com", password: "correct-password" }),
    ).resolves.toMatchObject({ id: user.id });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/localAccount.test.ts`
Expected: FAIL — `reloaded.hashedPassword` is still a bcrypt hash (no rehash yet).

- [ ] **Step 3: Implement rehash-on-login** in `src/lib/auth/localAccount.ts`

Change the password import:

```ts
import { hashPassword, needsRehash, verifyPassword } from "./password";
```

Replace the tail of `authorizeLocalPasswordLogin` — currently:

```ts
  if (!user?.hashedPassword || !user.emailVerifiedAt) return null;

  const ok = await verifyPassword(input.password, user.hashedPassword);
  return ok ? user : null;
}
```

with:

```ts
  if (!user?.hashedPassword || !user.emailVerifiedAt) return null;

  const ok = await verifyPassword(input.password, user.hashedPassword);
  if (!ok) return null;

  if (needsRehash(user.hashedPassword)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword: await hashPassword(input.password) },
    });
  }

  return user;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/localAccount.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/localAccount.ts src/lib/auth/localAccount.test.ts
git commit -m "feat(auth): rehash legacy passwords to Argon2id on login"
```

---

### Task 4: Login rate-limit + lockout module

**Files:**
- Create: `src/lib/auth/loginRateLimit.ts`
- Create: `src/lib/auth/loginRateLimit.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/auth/loginRateLimit.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  __resetLoginRateLimit,
  clearAttempts,
  isLockedOut,
  recordFailedAttempt,
} from "./loginRateLimit";

describe("login rate limit", () => {
  beforeEach(() => __resetLoginRateLimit());

  it("locks a key after MAX_ATTEMPTS failures", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(isLockedOut("email:a@b.com", t0)).toBe(false);
      recordFailedAttempt("email:a@b.com", t0);
    }
    expect(isLockedOut("email:a@b.com", t0)).toBe(true);
  });

  it("unlocks after the lockout window elapses", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedAttempt("k", t0);
    expect(isLockedOut("k", t0)).toBe(true);
    expect(isLockedOut("k", t0 + LOCKOUT_MS + 1)).toBe(false);
  });

  it("clearAttempts resets the counter", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailedAttempt("k", t0);
    clearAttempts("k");
    recordFailedAttempt("k", t0);
    expect(isLockedOut("k", t0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/loginRateLimit.test.ts`
Expected: FAIL — cannot find module `./loginRateLimit`.

- [ ] **Step 3: Implement** `src/lib/auth/loginRateLimit.ts`

```ts
// In-memory per-key failed-login limiter. Suitable for a single-process
// dev/preview deployment. For multi-instance production, back this with a shared
// store (e.g. Redis/Upstash) behind the same function signatures.
export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

type Attempt = { count: number; firstAt: number; lockedUntil?: number };
const attempts = new Map<string, Attempt>();

export function isLockedOut(key: string, now: number = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a?.lockedUntil) return false;
  if (now >= a.lockedUntil) {
    attempts.delete(key);
    return false;
  }
  return true;
}

export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const a = attempts.get(key);
  if (!a || now - a.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) a.lockedUntil = now + LOCKOUT_MS;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

// Test-only: reset shared state between cases.
export function __resetLoginRateLimit(): void {
  attempts.clear();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/loginRateLimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/loginRateLimit.ts src/lib/auth/loginRateLimit.test.ts
git commit -m "feat(auth): add in-memory login rate-limit + lockout module"
```

---

### Task 5: Enforce rate limit in password login

**Files:**
- Modify: `src/lib/auth/localAccount.ts`
- Modify: `src/lib/auth/localAccount.test.ts`

- [ ] **Step 1: Write the failing test + reset hook** in `src/lib/auth/localAccount.test.ts`

Add the import at the top:

```ts
import { __resetLoginRateLimit } from "./loginRateLimit";
```

Add a reset to the existing `beforeEach` (so other tests stay isolated):

```ts
    __resetLoginRateLimit();
```

Append this test inside the `describe` block:

```ts
  it("locks out password login after repeated failures, then ignores the correct password", async () => {
    const user = await registerLocalAccount({
      email: "lock@example.com",
      password: "correct-password",
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z") },
    });

    for (let i = 0; i < 5; i++) {
      await authorizeLocalPasswordLogin({ email: "lock@example.com", password: "wrong" });
    }

    await expect(
      authorizeLocalPasswordLogin({ email: "lock@example.com", password: "correct-password" }),
    ).resolves.toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/localAccount.test.ts`
Expected: FAIL — the correct password still authenticates (no lockout wired).

- [ ] **Step 3: Implement** the gate in `src/lib/auth/localAccount.ts`

Add the import:

```ts
import { clearAttempts, isLockedOut, recordFailedAttempt } from "./loginRateLimit";
```

Replace the whole `authorizeLocalPasswordLogin` function with:

```ts
export async function authorizeLocalPasswordLogin(input: LoginInput) {
  if (!input.password) return null;
  const identifier = selectedIdentifier(input);
  if (!identifier) return null;

  const rateKey = `${identifier.kind}:${identifier.value}`;
  if (isLockedOut(rateKey)) return null;

  const user =
    identifier.kind === "email"
      ? await prisma.user.findUnique({ where: { email: identifier.value } })
      : identifier.kind === "phone"
        ? await prisma.user.findUnique({ where: { phone: identifier.value } })
        : await prisma.user.findUnique({ where: { username: identifier.value } });

  if (!user?.hashedPassword || !user.emailVerifiedAt) {
    recordFailedAttempt(rateKey);
    return null;
  }

  const ok = await verifyPassword(input.password, user.hashedPassword);
  if (!ok) {
    recordFailedAttempt(rateKey);
    return null;
  }

  clearAttempts(rateKey);

  if (needsRehash(user.hashedPassword)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword: await hashPassword(input.password) },
    });
  }

  return user;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/localAccount.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/localAccount.ts src/lib/auth/localAccount.test.ts
git commit -m "feat(auth): rate-limit + lockout password login by identifier"
```

---

### Task 6: Short-lived JWT session config

**Files:**
- Create: `src/lib/auth/sessionConfig.ts`
- Create: `src/lib/auth/sessionConfig.test.ts`
- Modify: `auth.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/auth/sessionConfig.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SECONDS, sessionConfig } from "./sessionConfig";

describe("session config", () => {
  it("uses short-lived JWT sessions", () => {
    expect(sessionConfig.strategy).toBe("jwt");
    expect(sessionConfig.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(sessionConfig.maxAge).toBeLessThanOrEqual(60 * 60 * 24 * 7);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/sessionConfig.test.ts`
Expected: FAIL — cannot find module `./sessionConfig`.

- [ ] **Step 3: Implement** `src/lib/auth/sessionConfig.ts`

```ts
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Bounded JWT session lifetime. NextAuth already issues httpOnly, SameSite=Lax,
// __Secure- cookies in production; here we only tighten the TTL.
export const sessionConfig: { strategy: "jwt"; maxAge: number; updateAge: number } = {
  strategy: "jwt",
  maxAge: SESSION_MAX_AGE_SECONDS,
  updateAge: 60 * 60 * 24, // re-issue the JWT at most once per day
};
```

- [ ] **Step 4: Wire into `auth.ts`**

Add this import near the other local imports:

```ts
import { sessionConfig } from "./src/lib/auth/sessionConfig";
```

Replace:

```ts
  session: { strategy: "jwt" },
```

with:

```ts
  session: sessionConfig,
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/sessionConfig.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/sessionConfig.ts src/lib/auth/sessionConfig.test.ts auth.ts
git commit -m "feat(auth): bounded JWT session lifetime"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all suites pass (new `password`, `loginRateLimit`, `sessionConfig` + updated `localAccount`, plus the existing auth/exam/lessons suites).

- [ ] **Step 3: Manual login smoke (legacy → upgrade)**

The seeded user `test@rpas.dev` / `Test1234!` was created with a bcrypt hash. Start the dev server, sign in via the UI, then confirm the stored hash upgraded:

```bash
DATABASE_URL="file:/Users/quzhenrong/rpas-lms/prisma/dev.db" node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const u = await p.user.findUnique({ where: { email: 'test@rpas.dev' } });
console.log('algo:', u?.hashedPassword?.slice(0, 12));
await p.\$disconnect();
"
```

Expected: prints `algo: $argon2id$` after a successful login (was `$2b$10$` before). Requires `PEPPER` set in `.env`.

- [ ] **Step 4: (Optional) commit any incidental fixes**

```bash
git add -A && git commit -m "test(auth): phase 0 verification" --allow-empty
```

---

## Self-review

- **Spec coverage:** §A (Argon2id + pepper, dispatching verify, rehash-on-login) → Tasks 2–3; §B (rate limit + lockout) → Tasks 4–5; §D (bounded session) → Task 6. Breached-password, password policy, MFA, payments are intentionally **later phases**, not here.
- **Placeholders:** none — every code/test step contains the full content.
- **Type consistency:** `hashPassword` / `verifyPassword` / `needsRehash`; `MAX_ATTEMPTS` / `LOCKOUT_MS` / `isLockedOut` / `recordFailedAttempt` / `clearAttempts` / `__resetLoginRateLimit`; `sessionConfig` / `SESSION_MAX_AGE_SECONDS` are used identically across tasks.
- **Backward compatibility:** existing bcrypt users (incl. the seeded test account) keep logging in and are upgraded to Argon2id on next login; only one existing test assertion changes (Task 2 Step 4).
