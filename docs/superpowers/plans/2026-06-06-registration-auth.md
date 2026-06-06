# Registration Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-method registration/login with Google, Apple, email code, phone code, username plus verified contact, and difficulty-based free question access.

**Architecture:** Keep identity concerns separate from exam logic. Prisma stores `User`, `UserIdentity`, and `VerificationCode`; focused auth services handle code generation/verification and account creation; route handlers stay thin. The first provider implementation uses deterministic console/no-op senders in development and tests, with provider hooks isolated for real email/SMS later.

**Tech Stack:** Next.js App Router, Auth.js v5, Prisma 5 + SQLite, Zod, bcryptjs, Vitest, TypeScript.

---

## File Structure

- `prisma/schema.prisma`: expand user model, add `UserIdentity` and `VerificationCode`.
- `src/lib/auth/types.ts`: auth domain types for providers, channels, and access tiers.
- `src/lib/auth/verificationCode.ts`: create, hash, verify, consume, and rate-limit verification codes.
- `src/lib/auth/account.ts`: create/link users for email, phone, username, OAuth identities.
- `src/lib/auth/delivery.ts`: development/test email/SMS sender interface.
- `app/api/auth/code/request/route.ts`: request email/SMS code.
- `app/api/auth/code/verify/route.ts`: verify email/SMS code and create/login user-ready identity.
- `app/api/auth/register/username/route.ts`: create username account after code verification.
- `app/api/auth/username/check/route.ts`: check username availability.
- `auth.ts`: add Google, Apple, and verification-code credentials providers.
- `types/next-auth.d.ts`: keep session typing aligned with `accessTier`.
- `app/[locale]/register/page.tsx`: update UI to Google/Apple/email/phone/username flows.
- `app/[locale]/signin/page.tsx`: update UI to Google/Apple/email/phone/username code login.
- `src/lib/exam/access.ts`: switch `FREE` question filtering to `difficulty === 0`.
- `content/question-bank.json`: mark selected free questions with `difficulty: 0`.
- Tests live next to implementation files using existing Vitest patterns.

## Scope Note

This plan does not implement real payment or choose production email/SMS vendors. It creates the provider interfaces and uses local/test delivery behavior so the product flow and database rules are testable now.

---

### Task 1: Prisma Identity Model

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `src/lib/auth/account.test.ts`

- [ ] **Step 1: Write the failing model/service test**

Create `src/lib/auth/account.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";

describe("auth account persistence", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("stores a free user with optional email, phone, username, and identities", async () => {
    const user = await prisma.user.create({
      data: {
        username: "pilot-one",
        email: "pilot@example.com",
        phone: "+16045551234",
        displayName: "Pilot One",
        emailVerifiedAt: new Date("2026-06-06T00:00:00.000Z"),
        phoneVerifiedAt: new Date("2026-06-06T00:00:00.000Z"),
        identities: {
          create: {
            provider: "email",
            providerAccountId: "pilot@example.com",
            verifiedAt: new Date("2026-06-06T00:00:00.000Z"),
          },
        },
      },
      include: { identities: true },
    });

    expect(user.accessTier).toBe("FREE");
    expect(user.username).toBe("pilot-one");
    expect(user.identities).toHaveLength(1);
    expect(user.identities[0].provider).toBe("email");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/auth/account.test.ts
```

Expected: FAIL because Prisma Client does not have `verificationCode`, `userIdentity`, `username`, `phone`, `displayName`, `emailVerifiedAt`, or `phoneVerifiedAt`.

- [ ] **Step 3: Update Prisma schema**

Replace the `User` model in `prisma/schema.prisma` and add the two new models:

```prisma
model User {
  id              String        @id @default(cuid())
  username        String?       @unique
  email           String?       @unique
  phone           String?       @unique
  displayName     String?
  hashedPassword  String?
  accessTier      String        @default("FREE")
  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  identities      UserIdentity[]
  examSessions    ExamSession[]
}

model UserIdentity {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          String
  providerAccountId String
  verifiedAt        DateTime?
  createdAt         DateTime @default(now())

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model VerificationCode {
  id             String    @id @default(cuid())
  target         String
  channel        String
  codeHash       String
  attempts       Int       @default(0)
  expiresAt      DateTime
  consumedAt     DateTime?
  createdAt      DateTime  @default(now())

  @@index([target, channel])
}
```

- [ ] **Step 4: Generate and sync Prisma**

Run:

```bash
pnpm db:generate
pnpm db:push
```

Expected: Prisma Client generated and `dev.db` synced.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/lib/auth/account.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/auth/account.test.ts
git commit -m "feat: add auth identity data model"
```

---

### Task 2: Verification Code Service

**Files:**
- Create: `src/lib/auth/types.ts`
- Create: `src/lib/auth/verificationCode.ts`
- Test: `src/lib/auth/verificationCode.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/auth/verificationCode.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  requestVerificationCode,
  verifyCode,
  normalizeTarget,
} from "./verificationCode";

describe("verification code service", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.$disconnect();
  });

  it("normalizes email and phone targets", () => {
    expect(normalizeTarget("email", " Pilot@Example.COM ")).toBe("pilot@example.com");
    expect(normalizeTarget("sms", "(604) 555-1234")).toBe("+16045551234");
    expect(normalizeTarget("sms", "+1 604 555 1234")).toBe("+16045551234");
  });

  it("stores only a hash and verifies the plain 6-digit code once", async () => {
    const requested = await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "123456",
    });

    const row = await prisma.verificationCode.findUniqueOrThrow({
      where: { id: requested.id },
    });
    expect(row.codeHash).not.toBe("123456");
    expect(row.consumedAt).toBeNull();

    const first = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "123456",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(first.ok).toBe(true);

    const second = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "123456",
      now: () => new Date("2026-06-06T00:03:00.000Z"),
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("invalid_or_expired");
  });

  it("rejects expired codes", async () => {
    await requestVerificationCode({
      channel: "sms",
      target: "+16045551234",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "111111",
    });

    const result = await verifyCode({
      channel: "sms",
      target: "+16045551234",
      code: "111111",
      now: () => new Date("2026-06-06T00:11:00.000Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_or_expired");
  });

  it("locks after five failed attempts", async () => {
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
      codeFactory: () => "222222",
    });

    for (let i = 0; i < 5; i++) {
      await verifyCode({
        channel: "email",
        target: "pilot@example.com",
        code: "000000",
        now: () => new Date("2026-06-06T00:01:00.000Z"),
      });
    }

    const result = await verifyCode({
      channel: "email",
      target: "pilot@example.com",
      code: "222222",
      now: () => new Date("2026-06-06T00:02:00.000Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_many_attempts");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run src/lib/auth/verificationCode.test.ts
```

Expected: FAIL because `verificationCode.ts` does not exist.

- [ ] **Step 3: Create auth types**

Create `src/lib/auth/types.ts`:

```ts
export type VerificationChannel = "email" | "sms";
export type AccessTier = "FREE" | "PAID";
export type AuthProvider = "google" | "apple" | "email" | "phone" | "username";

export type VerificationFailureReason =
  | "invalid_or_expired"
  | "too_many_attempts";
```

- [ ] **Step 4: Implement verification service**

Create `src/lib/auth/verificationCode.ts`:

```ts
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { VerificationChannel, VerificationFailureReason } from "./types";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizeTarget(channel: VerificationChannel, target: string): string {
  const trimmed = target.trim();
  if (channel === "email") return trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestVerificationCode({
  channel,
  target,
  now = () => new Date(),
  codeFactory = generateSixDigitCode,
}: {
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
  codeFactory?: () => string;
}): Promise<{ id: string; target: string; code: string }> {
  const normalized = normalizeTarget(channel, target);
  const code = codeFactory();
  const codeHash = await bcrypt.hash(code, 10);
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + CODE_TTL_MS);

  await prisma.verificationCode.updateMany({
    where: { channel, target: normalized, consumedAt: null },
    data: { consumedAt: createdAt },
  });

  const row = await prisma.verificationCode.create({
    data: { channel, target: normalized, codeHash, expiresAt },
  });

  return { id: row.id, target: normalized, code };
}

export async function verifyCode({
  channel,
  target,
  code,
  now = () => new Date(),
}: {
  channel: VerificationChannel;
  target: string;
  code: string;
  now?: () => Date;
}): Promise<{ ok: true; target: string } | { ok: false; reason: VerificationFailureReason }> {
  const normalized = normalizeTarget(channel, target);
  const currentTime = now();
  const row = await prisma.verificationCode.findFirst({
    where: {
      channel,
      target: normalized,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row || row.expiresAt <= currentTime) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = await bcrypt.compare(code, row.codeHash);
  if (!matches) {
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid_or_expired" };
  }

  await prisma.verificationCode.update({
    where: { id: row.id },
    data: { consumedAt: currentTime },
  });
  return { ok: true, target: normalized };
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
pnpm vitest run src/lib/auth/verificationCode.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/types.ts src/lib/auth/verificationCode.ts src/lib/auth/verificationCode.test.ts
git commit -m "feat: add verification code service"
```

---

### Task 3: Account Creation and Linking Service

**Files:**
- Create: `src/lib/auth/account.ts`
- Modify: `src/lib/auth/account.test.ts`

- [ ] **Step 1: Extend failing tests**

Append to `src/lib/auth/account.test.ts`:

```ts
import {
  createOrLoginVerifiedContactUser,
  createUsernameUser,
  findOrCreateOAuthUser,
  isUsernameAvailable,
} from "./account";

describe("auth account service", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("creates a free email user and email identity", async () => {
    const user = await createOrLoginVerifiedContactUser({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(user.accessTier).toBe("FREE");
    expect(user.email).toBe("pilot@example.com");
    expect(user.emailVerifiedAt).not.toBeNull();

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "email",
          providerAccountId: "pilot@example.com",
        },
      },
    });
    expect(identity?.userId).toBe(user.id);
  });

  it("creates a username user only with a verified contact", async () => {
    const user = await createUsernameUser({
      username: "pilotone",
      channel: "sms",
      target: "+16045551234",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    expect(user.username).toBe("pilotone");
    expect(user.phone).toBe("+16045551234");
    expect(user.phoneVerifiedAt).not.toBeNull();
  });

  it("reports username availability", async () => {
    expect(await isUsernameAvailable("pilotone")).toBe(true);
    await createUsernameUser({
      username: "pilotone",
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });
    expect(await isUsernameAvailable("pilotone")).toBe(false);
  });

  it("links OAuth identity to an existing verified email user", async () => {
    const emailUser = await createOrLoginVerifiedContactUser({
      channel: "email",
      target: "pilot@example.com",
      now: () => new Date("2026-06-06T00:00:00.000Z"),
    });

    const oauthUser = await findOrCreateOAuthUser({
      provider: "google",
      providerAccountId: "google-123",
      email: "pilot@example.com",
      emailVerified: true,
      displayName: "Pilot",
      now: () => new Date("2026-06-06T00:01:00.000Z"),
    });

    expect(oauthUser.id).toBe(emailUser.id);
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "google-123",
        },
      },
    });
    expect(identity?.userId).toBe(emailUser.id);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run src/lib/auth/account.test.ts
```

Expected: FAIL because `account.ts` does not exist.

- [ ] **Step 3: Implement account service**

Create `src/lib/auth/account.ts`:

```ts
import { prisma } from "../db";
import { normalizeTarget } from "./verificationCode";
import type { AuthProvider, VerificationChannel } from "./types";

function assertUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new Error("invalid_username");
  }
  return normalized;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const normalized = assertUsername(username);
  const existing = await prisma.user.findUnique({ where: { username: normalized } });
  return !existing;
}

export async function createOrLoginVerifiedContactUser({
  channel,
  target,
  now = () => new Date(),
}: {
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
}) {
  const normalized = normalizeTarget(channel, target);
  const provider = channel === "email" ? "email" : "phone";
  const verifiedAt = now();

  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId: normalized },
    },
    include: { user: true },
  });
  if (existingIdentity) return existingIdentity.user;

  const existingUser =
    channel === "email"
      ? await prisma.user.findUnique({ where: { email: normalized } })
      : await prisma.user.findUnique({ where: { phone: normalized } });

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerifiedAt: channel === "email" ? existingUser.emailVerifiedAt ?? verifiedAt : existingUser.emailVerifiedAt,
        phoneVerifiedAt: channel === "sms" ? existingUser.phoneVerifiedAt ?? verifiedAt : existingUser.phoneVerifiedAt,
        identities: {
          create: { provider, providerAccountId: normalized, verifiedAt },
        },
      },
    });
  }

  return prisma.user.create({
    data: {
      email: channel === "email" ? normalized : undefined,
      phone: channel === "sms" ? normalized : undefined,
      emailVerifiedAt: channel === "email" ? verifiedAt : undefined,
      phoneVerifiedAt: channel === "sms" ? verifiedAt : undefined,
      accessTier: "FREE",
      identities: {
        create: { provider, providerAccountId: normalized, verifiedAt },
      },
    },
  });
}

export async function createUsernameUser({
  username,
  channel,
  target,
  now = () => new Date(),
}: {
  username: string;
  channel: VerificationChannel;
  target: string;
  now?: () => Date;
}) {
  const normalizedUsername = assertUsername(username);
  const user = await createOrLoginVerifiedContactUser({ channel, target, now });
  return prisma.user.update({
    where: { id: user.id },
    data: {
      username: normalizedUsername,
      identities: {
        create: {
          provider: "username",
          providerAccountId: normalizedUsername,
          verifiedAt: now(),
        },
      },
    },
  });
}

export async function findOrCreateOAuthUser({
  provider,
  providerAccountId,
  email,
  emailVerified,
  displayName,
  now = () => new Date(),
}: {
  provider: Extract<AuthProvider, "google" | "apple">;
  providerAccountId: string;
  email?: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  now?: () => Date;
}) {
  const existingIdentity = await prisma.userIdentity.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: true },
  });
  if (existingIdentity) return existingIdentity.user;

  const normalizedEmail = email ? normalizeTarget("email", email) : null;
  const verifiedAt = now();
  const existingUser = normalizedEmail
    ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
    : null;

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: existingUser.displayName ?? displayName ?? undefined,
        emailVerifiedAt: emailVerified ? existingUser.emailVerifiedAt ?? verifiedAt : existingUser.emailVerifiedAt,
        identities: {
          create: { provider, providerAccountId, verifiedAt: emailVerified ? verifiedAt : null },
        },
      },
    });
  }

  return prisma.user.create({
    data: {
      email: normalizedEmail ?? undefined,
      displayName: displayName ?? undefined,
      emailVerifiedAt: emailVerified && normalizedEmail ? verifiedAt : undefined,
      accessTier: "FREE",
      identities: {
        create: { provider, providerAccountId, verifiedAt: emailVerified ? verifiedAt : null },
      },
    },
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
pnpm vitest run src/lib/auth/account.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/account.ts src/lib/auth/account.test.ts
git commit -m "feat: add account linking service"
```

---

### Task 4: Verification Code API Routes

**Files:**
- Create: `src/lib/auth/delivery.ts`
- Create: `app/api/auth/code/request/route.ts`
- Create: `app/api/auth/code/verify/route.ts`
- Test: `app/api/auth/code/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `app/api/auth/code/routes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as requestCode } from "./request/route";
import { POST as verifyCodeRoute } from "./verify/route";

async function body(res: Response) {
  return { status: res.status, json: await res.json() };
}

describe("verification code routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("requests an email code without returning the code", async () => {
    const res = await requestCode(new Request("http://test/api/auth/code/request", {
      method: "POST",
      body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
    }));

    const result = await body(res);
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });

    const code = await prisma.verificationCode.findFirstOrThrow({
      where: { channel: "email", target: "pilot@example.com" },
    });
    expect(code.codeHash).toBeTruthy();
  });

  it("verifies a code and creates a free user", async () => {
    await requestCode(new Request("http://test/api/auth/code/request", {
      method: "POST",
      body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
    }));
    const row = await prisma.verificationCode.findFirstOrThrow();
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { codeHash: await (await import("bcryptjs")).default.hash("123456", 10) },
    });

    const res = await verifyCodeRoute(new Request("http://test/api/auth/code/verify", {
      method: "POST",
      body: JSON.stringify({ channel: "email", target: "pilot@example.com", code: "123456" }),
    }));

    const result = await body(res);
    expect(result.status).toBe(200);
    expect(result.json.user.accessTier).toBe("FREE");
    expect(result.json.user.email).toBe("pilot@example.com");
  });

  it("rejects invalid payloads", async () => {
    const res = await requestCode(new Request("http://test/api/auth/code/request", {
      method: "POST",
      body: JSON.stringify({ channel: "fax", target: "" }),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run app/api/auth/code/routes.test.ts
```

Expected: FAIL because the route files do not exist.

- [ ] **Step 3: Add delivery interface**

Create `src/lib/auth/delivery.ts`:

```ts
import type { VerificationChannel } from "./types";

export async function sendVerificationCode({
  channel,
  target,
  code,
}: {
  channel: VerificationChannel;
  target: string;
  code: string;
}): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth-code] ${channel}:${target} code=${code}`);
    return;
  }
  console.info(`[auth-code] ${channel}:${target} code generated`);
}
```

- [ ] **Step 4: Implement request route**

Create `app/api/auth/code/request/route.ts`:

```ts
import { z } from "zod";
import { requestVerificationCode } from "../../../../../src/lib/auth/verificationCode";
import { sendVerificationCode } from "../../../../../src/lib/auth/delivery";

const RequestBody = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const requested = await requestVerificationCode(parsed.data);
  await sendVerificationCode({
    channel: parsed.data.channel,
    target: requested.target,
    code: requested.code,
  });

  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Implement verify route**

Create `app/api/auth/code/verify/route.ts`:

```ts
import { z } from "zod";
import { verifyCode } from "../../../../../src/lib/auth/verificationCode";
import { createOrLoginVerifiedContactUser } from "../../../../../src/lib/auth/account";

const VerifyBody = z.object({
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = VerifyBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const verified = await verifyCode(parsed.data);
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  const user = await createOrLoginVerifiedContactUser({
    channel: parsed.data.channel,
    target: verified.target,
  });

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      accessTier: user.accessTier,
    },
  });
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
pnpm vitest run app/api/auth/code/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/delivery.ts app/api/auth/code app/api/auth/code/routes.test.ts
git commit -m "feat: add verification code routes"
```

---

### Task 5: Username Registration API

**Files:**
- Create: `app/api/auth/register/username/route.ts`
- Create: `app/api/auth/username/check/route.ts`
- Test: `app/api/auth/register/username/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/auth/register/username/route.test.ts`:

```ts
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { POST as requestCode } from "../../code/request/route";
import { POST as registerUsername } from "./route";
import { GET as checkUsername } from "../../username/check/route";

describe("username registration routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("checks username availability", async () => {
    const available = await checkUsername(new Request("http://test/api/auth/username/check?username=pilotone"));
    expect(await available.json()).toEqual({ available: true });

    await prisma.user.create({ data: { username: "pilotone", accessTier: "FREE" } });

    const taken = await checkUsername(new Request("http://test/api/auth/username/check?username=pilotone"));
    expect(await taken.json()).toEqual({ available: false });
  });

  it("creates a username user after email code verification", async () => {
    await requestCode(new Request("http://test/api/auth/code/request", {
      method: "POST",
      body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
    }));
    const row = await prisma.verificationCode.findFirstOrThrow();
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { codeHash: await bcrypt.hash("123456", 10) },
    });

    const res = await registerUsername(new Request("http://test/api/auth/register/username", {
      method: "POST",
      body: JSON.stringify({
        username: "pilotone",
        channel: "email",
        target: "pilot@example.com",
        code: "123456",
      }),
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("pilotone");
    expect(body.user.email).toBe("pilot@example.com");
    expect(body.user.accessTier).toBe("FREE");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run app/api/auth/register/username/route.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement username check route**

Create `app/api/auth/username/check/route.ts`:

```ts
import { isUsernameAvailable } from "../../../../../src/lib/auth/account";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const username = url.searchParams.get("username") ?? "";
  try {
    const available = await isUsernameAvailable(username);
    return Response.json({ available });
  } catch {
    return Response.json({ available: false }, { status: 400 });
  }
}
```

- [ ] **Step 4: Implement username registration route**

Create `app/api/auth/register/username/route.ts`:

```ts
import { z } from "zod";
import { createUsernameUser } from "../../../../../src/lib/auth/account";
import { verifyCode } from "../../../../../src/lib/auth/verificationCode";

const UsernameBody = z.object({
  username: z.string().min(3).max(24),
  channel: z.enum(["email", "sms"]),
  target: z.string().min(3),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = UsernameBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const verified = await verifyCode(parsed.data);
  if (!verified.ok) return Response.json({ error: verified.reason }, { status: 400 });

  try {
    const user = await createUsernameUser({
      username: parsed.data.username,
      channel: parsed.data.channel,
      target: verified.target,
    });
    return Response.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        accessTier: user.accessTier,
      },
    }, { status: 201 });
  } catch {
    return Response.json({ error: "username unavailable" }, { status: 409 });
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
pnpm vitest run app/api/auth/register/username/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/register/username app/api/auth/username/check app/api/auth/register/username/route.test.ts
git commit -m "feat: add username registration routes"
```

---

### Task 6: Auth.js Providers

**Files:**
- Modify: `auth.ts`
- Modify: `types/next-auth.d.ts`
- Test: `src/lib/auth/account.test.ts`

- [ ] **Step 1: Add test for provider account behavior**

Append to `src/lib/auth/account.test.ts`:

```ts
it("creates separate OAuth identities for google and apple", async () => {
  const google = await findOrCreateOAuthUser({
    provider: "google",
    providerAccountId: "google-1",
    email: "pilot@example.com",
    emailVerified: true,
    displayName: "Pilot",
    now: () => new Date("2026-06-06T00:00:00.000Z"),
  });

  const apple = await findOrCreateOAuthUser({
    provider: "apple",
    providerAccountId: "apple-1",
    email: "pilot@example.com",
    emailVerified: true,
    displayName: "Pilot",
    now: () => new Date("2026-06-06T00:01:00.000Z"),
  });

  expect(apple.id).toBe(google.id);
  const identities = await prisma.userIdentity.findMany({
    where: { userId: google.id },
    orderBy: { provider: "asc" },
  });
  expect(identities.map((i) => i.provider)).toEqual(["apple", "google"]);
});
```

- [ ] **Step 2: Run test to verify current service passes**

Run:

```bash
pnpm vitest run src/lib/auth/account.test.ts
```

Expected: PASS. This confirms the account service supports Auth.js provider wiring.

- [ ] **Step 3: Update Auth.js providers**

Modify `auth.ts` imports and providers:

```ts
import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "./src/lib/db";
import { createOrLoginVerifiedContactUser, findOrCreateOAuthUser } from "./src/lib/auth/account";
import { verifyPassword } from "./src/lib/auth/password";
```

In the `providers` array, keep the existing password credentials provider for backward compatibility, then add Google, Apple, and a code credentials provider:

```ts
Google({
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
}),
Apple({
  clientId: process.env.APPLE_CLIENT_ID ?? "",
  clientSecret: process.env.APPLE_CLIENT_SECRET ?? "",
}),
Credentials({
  id: "code",
  name: "Verification Code",
  credentials: {
    channel: {},
    target: {},
  },
  async authorize(creds) {
    const channel = creds?.channel === "sms" ? "sms" : "email";
    const target = typeof creds?.target === "string" ? creds.target : "";
    if (!target) return null;
    const user = await createOrLoginVerifiedContactUser({ channel, target });
    return {
      id: user.id,
      email: user.email ?? undefined,
      name: user.displayName ?? user.username ?? undefined,
      accessTier: user.accessTier,
    };
  },
}),
```

Add callbacks:

```ts
async signIn({ account, profile }) {
  if (account?.provider === "google" || account?.provider === "apple") {
    const email = typeof profile?.email === "string" ? profile.email : null;
    const emailVerified =
      account.provider === "apple" ? Boolean(email) : Boolean((profile as { email_verified?: boolean })?.email_verified);
    const name = typeof profile?.name === "string" ? profile.name : null;
    await findOrCreateOAuthUser({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      email,
      emailVerified,
      displayName: name,
    });
  }
  return true;
},
```

Keep existing `jwt` and `session` access-tier logic. Ensure `session.user.accessTier` remains typed as `"FREE" | "PAID"`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If provider env variables are empty in development, Auth.js should still compile.

- [ ] **Step 5: Commit**

```bash
git add auth.ts types/next-auth.d.ts src/lib/auth/account.test.ts
git commit -m "feat: wire oauth and code auth providers"
```

---

### Task 7: Registration and Login UI

**Files:**
- Modify: `app/[locale]/register/page.tsx`
- Modify: `app/[locale]/signin/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add translation keys**

Add these keys under `auth` in both `messages/en.json` and `messages/zh.json`.

English values:

```json
{
  "continueGoogle": "Continue with Google",
  "continueApple": "Continue with Apple",
  "emailCode": "Email code",
  "phoneCode": "Phone code",
  "username": "Username",
  "phone": "Phone",
  "sendCode": "Send code",
  "verifyCode": "Verify code",
  "code": "6-digit code",
  "codeSent": "Verification code sent.",
  "usernameUnavailable": "Username is unavailable.",
  "verificationFailed": "Invalid or expired code."
}
```

Chinese values:

```json
{
  "continueGoogle": "使用 Google 继续",
  "continueApple": "使用 Apple 继续",
  "emailCode": "邮箱验证码",
  "phoneCode": "手机验证码",
  "username": "用户名",
  "phone": "手机号",
  "sendCode": "发送验证码",
  "verifyCode": "验证",
  "code": "6 位验证码",
  "codeSent": "验证码已发送。",
  "usernameUnavailable": "用户名不可用。",
  "verificationFailed": "验证码无效或已过期。"
}
```

- [ ] **Step 2: Update register page**

Replace `app/[locale]/register/page.tsx` with a client component that:

```ts
type Mode = "email" | "phone" | "username";
```

Uses these local states:

```ts
const [mode, setMode] = useState<Mode>("email");
const [target, setTarget] = useState("");
const [username, setUsername] = useState("");
const [code, setCode] = useState("");
const [codeSent, setCodeSent] = useState(false);
const [error, setError] = useState<string | null>(null);
const [busy, setBusy] = useState(false);
```

Add send-code behavior:

```ts
async function sendCode() {
  setBusy(true);
  setError(null);
  const channel = mode === "phone" ? "sms" : "email";
  const res = await fetch("/api/auth/code/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, target }),
  });
  setBusy(false);
  if (!res.ok) {
    setError(t("registerFailed"));
    return;
  }
  setCodeSent(true);
}
```

Add verify/register behavior:

```ts
async function verify() {
  setBusy(true);
  setError(null);
  const channel = mode === "phone" ? "sms" : "email";
  const url = mode === "username" ? "/api/auth/register/username" : "/api/auth/code/verify";
  const payload =
    mode === "username"
      ? { username, channel: target.includes("@") ? "email" : "sms", target, code }
      : { channel, target, code };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  setBusy(false);
  if (!res.ok) {
    setError(t("verificationFailed"));
    return;
  }
  await signIn("code", {
    channel: payload.channel,
    target: payload.target,
    redirect: false,
  });
  router.push(`/${locale}`);
  router.refresh();
}
```

Add OAuth buttons:

```tsx
<button type="button" className="btn-launch" onClick={() => signIn("google", { callbackUrl: `/${locale}` })}>
  {t("continueGoogle")}
</button>
<button type="button" className="btn-launch" onClick={() => signIn("apple", { callbackUrl: `/${locale}` })}>
  {t("continueApple")}
</button>
```

Use the existing `.auth-view`, `.auth-card`, `.auth-label`, `.auth-input`, `.auth-error`, and `.btn-launch` classes.

- [ ] **Step 3: Update sign-in page**

Modify `app/[locale]/signin/page.tsx` to use the same Google/Apple and code login options. Keep the current password form below the code flow for backward compatibility, labeled with existing `password`.

The code-login submit should call:

```ts
await signIn("code", { channel, target, redirect: false });
```

after `/api/auth/code/verify` succeeds.

- [ ] **Step 4: Run typecheck and build**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/register/page.tsx app/[locale]/signin/page.tsx messages/en.json messages/zh.json
git commit -m "feat: add code-based auth UI"
```

---

### Task 8: Difficulty-Based Free Question Access

**Files:**
- Modify: `src/lib/exam/access.ts`
- Modify: `src/lib/exam/access.test.ts`
- Modify: `content/question-bank.json`
- Modify: `src/lib/content/schema.ts`
- Modify: `src/lib/content/schema.test.ts`

- [ ] **Step 1: Write failing access tests**

Replace the second test in `src/lib/exam/access.test.ts` with:

```ts
it("limits free users to difficulty 0 questions", () => {
  const free = questionsForAccess(bank.questions, "FREE", "BASIC");
  const paid = questionsForAccess(bank.questions, "PAID", "BASIC");

  expect(free.length).toBeGreaterThan(0);
  expect(free.length).toBeLessThan(paid.length);
  expect(free.every((q) => q.difficulty === 0)).toBe(true);
});
```

Add a schema test in `src/lib/content/schema.test.ts`:

```ts
it("accepts difficulty 0 for free questions", () => {
  const freeQuestion = { ...validSingle, difficulty: 0 };
  expect(QuestionSchema.safeParse(freeQuestion).success).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run src/lib/exam/access.test.ts src/lib/content/schema.test.ts
```

Expected: FAIL because schema currently requires difficulty >= 1 and access still filters by module.

- [ ] **Step 3: Update schema**

Modify `src/lib/content/schema.ts`:

```ts
difficulty: z.number().int().min(0).max(3),
```

- [ ] **Step 4: Update access function**

Modify `questionsForAccess` in `src/lib/exam/access.ts`:

```ts
export function questionsForAccess(
  questions: Question[],
  tier: AccessTier,
  certLevel: ExamCertLevel,
): Question[] {
  const eligible = questions.filter((q) => q.certLevel === certLevel || q.certLevel === "BOTH");
  if (tier === "PAID") return eligible;
  if (tier === "FREE") return eligible.filter((q) => q.difficulty === 0);
  return [];
}
```

- [ ] **Step 5: Mark free questions**

Edit `content/question-bank.json` so a small Basic-eligible starter set uses `"difficulty": 0`. Pick at least one question from each of these modules if present:

- `air-law`
- `human-factors`
- `meteorology`
- `navigation`

Keep paid questions at difficulty `1`, `2`, or `3`.

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
pnpm vitest run src/lib/exam/access.test.ts src/lib/content/schema.test.ts src/lib/exam/service.test.ts app/api/exam/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/exam/access.ts src/lib/exam/access.test.ts src/lib/content/schema.ts src/lib/content/schema.test.ts content/question-bank.json
git commit -m "feat: gate free questions by difficulty"
```

---

### Task 9: Final Verification and Docs

**Files:**
- Modify: `README.md`
- Modify: `content/question-bank-README.md`
- Optional Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Update README behavior summary**

Update `README.md` sections for:

- registration options
- email/phone 6-digit verification codes
- username requiring verified contact
- `difficulty: 0` free questions
- `FREE` and `PAID` access tiers

Add this concise paragraph:

```md
Registered users are `FREE` by default. Free users can access free lessons and questions marked `difficulty: 0`; paid users can access the full question bank. Username registration is allowed only after verifying an email or phone number.
```

- [ ] **Step 2: Update question-bank README**

Update `content/question-bank-README.md` schema notes:

```md
`difficulty: 0` marks a free question. `difficulty: 1..3` marks paid questions by increasing difficulty.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected:

- `pnpm test`: all tests pass.
- `pnpm typecheck`: exits 0.
- `pnpm build`: production build succeeds.

- [ ] **Step 4: Check for stale French locale**

Run:

```bash
rg -n '"FR"|\\bFR\\b|/fr\\b|messages/fr|French|法语|法文' app src messages content types middleware.ts README.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add README.md content/question-bank-README.md docs/PROGRESS.md
git commit -m "docs: update auth and access documentation"
```

---

## Self-Review

Spec coverage:

- Google and Apple OAuth: Task 6.
- Email and phone 6-digit codes: Tasks 2, 4, 7.
- Username with verified email/phone: Tasks 3, 5, 7.
- Free registration and `FREE` default: Tasks 1, 3, 4, 5.
- `difficulty: 0` free question access: Task 8.
- Guest/FREE/PAID tiers: Tasks 1, 6, 8.
- UI registration behavior: Task 7.
- Documentation: Task 9.

No payment implementation is included, matching the design's non-goals.
