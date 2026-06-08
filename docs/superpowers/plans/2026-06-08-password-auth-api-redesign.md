# Password Auth API Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed verification-code login flow with password-based local registration/login, where registration requires verified email and login accepts exactly one of email, phone, or username plus password.

**Architecture:** Keep route handlers thin and move account state transitions into `src/lib/auth/localAccount.ts`. Reuse the existing `VerificationCode` service only for registration email verification. Keep NextAuth responsible for sessions and update the credentials provider to delegate password-login decisions to the local account service.

**Tech Stack:** Next.js App Router, Auth.js v5, Prisma 5 + SQLite, Zod, bcryptjs, Vitest, TypeScript.

---

## File Structure

- Create `src/lib/auth/localAccount.ts`: local password-account registration, email verification, and password login lookup.
- Create `src/lib/auth/localAccount.test.ts`: service-level TDD for registration, verification, and local login rules.
- Modify `app/api/auth/register/route.ts`: create pending local account and send registration email code.
- Modify `app/api/auth/register/route.test.ts`: route tests for new registration behavior.
- Create `app/api/auth/register/verify-email/route.ts`: verify registration email code.
- Create `app/api/auth/register/verify-email/route.test.ts`: route tests for email verification.
- Modify `auth.ts`: credentials provider accepts `email`, `phone`, or `username` plus `password`.
- Modify `app/api/auth/code/request/route.ts`: retire public code-login endpoint with `410 Gone`.
- Modify `app/api/auth/code/verify/route.ts`: retire public code-login endpoint with `410 Gone`.
- Modify `app/api/auth/code/routes.test.ts`: assert retired code-login endpoints no longer create users or sessions.
- Modify `app/api/auth/register/username/route.ts`: retire standalone username-registration endpoint with `410 Gone`.
- Modify `app/api/auth/register/username/route.test.ts`: keep username availability test, update registration endpoint test to `410`.
- Modify `app/[locale]/register/page.tsx`: call new registration and email-verification endpoints.
- Modify `app/[locale]/signin/page.tsx`: use password login with email, phone, or username.
- Modify `messages/en.json` and `messages/zh.json`: add minimal auth copy needed by the updated pages.

---

### Task 1: Local Account Service

**Files:**
- Create: `src/lib/auth/localAccount.ts`
- Test: `src/lib/auth/localAccount.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `src/lib/auth/localAccount.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { requestVerificationCode } from "./verificationCode";
import {
  authorizeLocalPasswordLogin,
  registerLocalAccount,
  verifyRegistrationEmail,
} from "./localAccount";

describe("local password accounts", () => {
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

  it("registers a pending user with a hashed password and optional aliases", async () => {
    const user = await registerLocalAccount({
      email: " Pilot@Example.COM ",
      password: "correct-password",
      username: "Pilot_One",
      phone: "(604) 555-1234",
    });

    expect(user.email).toBe("pilot@example.com");
    expect(user.username).toBe("pilot_one");
    expect(user.phone).toBe("+16045551234");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.hashedPassword).not.toBe("correct-password");
    expect(await bcrypt.compare("correct-password", user.hashedPassword ?? "")).toBe(true);
  });

  it("rejects duplicate verified emails, usernames, and phones", async () => {
    await prisma.user.create({
      data: {
        email: "taken@example.com",
        username: "taken",
        phone: "+16045550000",
        hashedPassword: "hash",
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "FREE",
      },
    });

    await expect(
      registerLocalAccount({ email: "taken@example.com", password: "correct-password" }),
    ).rejects.toThrow("email_already_registered");

    await expect(
      registerLocalAccount({
        email: "new@example.com",
        password: "correct-password",
        username: "taken",
      }),
    ).rejects.toThrow("username_unavailable");

    await expect(
      registerLocalAccount({
        email: "phone@example.com",
        password: "correct-password",
        phone: "604-555-0000",
      }),
    ).rejects.toThrow("phone_unavailable");
  });

  it("verifies registration email and then allows email, phone, and username login", async () => {
    await registerLocalAccount({
      email: "pilot@example.com",
      password: "correct-password",
      username: "pilotone",
      phone: "+1 604 555 1234",
    });
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      codeFactory: () => "123456",
      now: () => new Date("2026-06-08T00:00:00.000Z"),
    });

    const beforeVerify = await authorizeLocalPasswordLogin({
      email: "pilot@example.com",
      password: "correct-password",
    });
    expect(beforeVerify).toBeNull();

    await expect(
      verifyRegistrationEmail({
        email: "pilot@example.com",
        code: "123456",
        now: () => new Date("2026-06-08T00:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      authorizeLocalPasswordLogin({ email: "pilot@example.com", password: "correct-password" }),
    ).resolves.toMatchObject({ email: "pilot@example.com" });
    await expect(
      authorizeLocalPasswordLogin({ phone: "(604) 555-1234", password: "correct-password" }),
    ).resolves.toMatchObject({ phone: "+16045551234" });
    await expect(
      authorizeLocalPasswordLogin({ username: "PilotOne", password: "correct-password" }),
    ).resolves.toMatchObject({ username: "pilotone" });
  });

  it("rejects password login with zero or multiple identifiers", async () => {
    await expect(authorizeLocalPasswordLogin({ password: "correct-password" })).resolves.toBeNull();
    await expect(
      authorizeLocalPasswordLogin({
        email: "pilot@example.com",
        username: "pilotone",
        password: "correct-password",
      }),
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the service tests to verify RED**

Run:

```bash
pnpm vitest run src/lib/auth/localAccount.test.ts
```

Expected: FAIL because `src/lib/auth/localAccount.ts` does not exist.

- [ ] **Step 3: Implement the minimal local account service**

Create `src/lib/auth/localAccount.ts`:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { normalizeTarget, verifyCode } from "./verificationCode";

type LocalIdentifier = {
  email?: string;
  phone?: string;
  username?: string;
};

type RegisterLocalAccountInput = {
  email: string;
  password: string;
  phone?: string;
  username?: string;
};

type LoginInput = LocalIdentifier & {
  password?: string;
};

function normalizeEmail(email: string): string {
  return normalizeTarget("email", email);
}

function normalizePhone(phone: string): string {
  return normalizeTarget("sms", phone);
}

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new Error("invalid_username");
  }
  return normalized;
}

function selectedIdentifier(input: LocalIdentifier):
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "username"; value: string }
  | null {
  const selected: Array<
    | { kind: "email"; value: string }
    | { kind: "phone"; value: string }
    | { kind: "username"; value: string }
  > = [];

  if (input.email) selected.push({ kind: "email", value: normalizeEmail(input.email) });
  if (input.phone) selected.push({ kind: "phone", value: normalizePhone(input.phone) });
  if (input.username) selected.push({ kind: "username", value: normalizeUsername(input.username) });

  return selected.length === 1 ? selected[0] : null;
}

async function assertAliasAvailable({
  email,
  phone,
  username,
  currentUserId,
}: {
  email: string;
  phone?: string;
  username?: string;
  currentUserId?: string;
}) {
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail?.emailVerifiedAt && existingEmail.id !== currentUserId) {
    throw new Error("email_already_registered");
  }

  if (username) {
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername && existingUsername.id !== currentUserId) {
      throw new Error("username_unavailable");
    }
  }

  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone && existingPhone.id !== currentUserId) {
      throw new Error("phone_unavailable");
    }
  }
}

export async function registerLocalAccount(input: RegisterLocalAccountInput) {
  const email = normalizeEmail(input.email);
  const username = input.username ? normalizeUsername(input.username) : undefined;
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const existingPendingUser = await prisma.user.findUnique({ where: { email } });

  await assertAliasAvailable({
    email,
    username,
    phone,
    currentUserId: existingPendingUser?.emailVerifiedAt ? undefined : existingPendingUser?.id,
  });

  const hashedPassword = await hashPassword(input.password);
  const data = {
    username: username ?? null,
    phone: phone ?? null,
    hashedPassword,
    accessTier: "FREE",
    emailVerifiedAt: null,
  };

  if (existingPendingUser && !existingPendingUser.emailVerifiedAt) {
    return prisma.user.update({
      where: { id: existingPendingUser.id },
      data,
    });
  }

  return prisma.user.create({
    data: {
      ...data,
      email,
    },
  });
}

export async function verifyRegistrationEmail({
  email,
  code,
  now = () => new Date(),
}: {
  email: string;
  code: string;
  now?: () => Date;
}): Promise<{ ok: true } | { ok: false; reason: "invalid_or_expired" | "too_many_attempts" }> {
  const normalizedEmail = normalizeEmail(email);
  const verified = await verifyCode({
    channel: "email",
    target: normalizedEmail,
    code,
    now,
  });

  if (!verified.ok) return verified;

  const verifiedAt = now();
  try {
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        emailVerifiedAt: verifiedAt,
        identities: {
          upsert: {
            where: {
              provider_providerAccountId: {
                provider: "email",
                providerAccountId: normalizedEmail,
              },
            },
            create: {
              provider: "email",
              providerAccountId: normalizedEmail,
              verifiedAt,
            },
            update: { verifiedAt },
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, reason: "invalid_or_expired" };
    }
    throw error;
  }

  return { ok: true };
}

export async function authorizeLocalPasswordLogin(input: LoginInput) {
  if (!input.password) return null;
  const identifier = selectedIdentifier(input);
  if (!identifier) return null;

  const user =
    identifier.kind === "email"
      ? await prisma.user.findUnique({ where: { email: identifier.value } })
      : identifier.kind === "phone"
        ? await prisma.user.findUnique({ where: { phone: identifier.value } })
        : await prisma.user.findUnique({ where: { username: identifier.value } });
  if (!user?.hashedPassword || !user.emailVerifiedAt) return null;

  const ok = await verifyPassword(input.password, user.hashedPassword);
  return ok ? user : null;
}
```

- [ ] **Step 4: Run the service tests to verify GREEN**

Run:

```bash
pnpm vitest run src/lib/auth/localAccount.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the service**

Run:

```bash
git add src/lib/auth/localAccount.ts src/lib/auth/localAccount.test.ts
git commit -m "feat: add local password account service"
```

---

### Task 2: Registration Routes

**Files:**
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/auth/register/route.test.ts`
- Create: `app/api/auth/register/verify-email/route.ts`
- Create: `app/api/auth/register/verify-email/route.test.ts`

- [ ] **Step 1: Replace registration route tests with new RED expectations**

Replace `app/api/auth/register/route.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as register } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a pending password account and sends an email verification code", async () => {
    const res = await register(req({
      email: "Pilot@Example.COM",
      password: "correct-password",
      username: "PilotOne",
      phone: "(604) 555-1234",
    }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, emailVerificationRequired: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "pilot@example.com" } });
    expect(user.username).toBe("pilotone");
    expect(user.phone).toBe("+16045551234");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.hashedPassword).toBeTruthy();

    const code = await prisma.verificationCode.findFirstOrThrow({
      where: { channel: "email", target: "pilot@example.com" },
    });
    expect(code.codeHash).toBeTruthy();
  });

  it("rejects invalid bodies", async () => {
    const res = await register(req({ email: "bad", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("rejects a verified duplicate email", async () => {
    await prisma.user.create({
      data: {
        email: "dup@example.com",
        hashedPassword: "hash",
        emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z"),
        accessTier: "FREE",
      },
    });

    const res = await register(req({ email: "dup@example.com", password: "correct-password" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_already_registered" });
  });
});
```

Create `app/api/auth/register/verify-email/route.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { requestVerificationCode } from "../../../../../src/lib/auth/verificationCode";
import { POST as register } from "../route";
import { POST as verifyEmail } from "./route";

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register/verify-email", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("verifies the pending registration email", async () => {
    await register(post("http://test/api/auth/register", {
      email: "pilot@example.com",
      password: "correct-password",
    }));
    await requestVerificationCode({
      channel: "email",
      target: "pilot@example.com",
      codeFactory: () => "123456",
    });

    const res = await verifyEmail(post("http://test/api/auth/register/verify-email", {
      email: "pilot@example.com",
      code: "123456",
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "pilot@example.com" } });
    expect(user.emailVerifiedAt).toBeTruthy();

    const identity = await prisma.userIdentity.findUniqueOrThrow({
      where: {
        provider_providerAccountId: {
          provider: "email",
          providerAccountId: "pilot@example.com",
        },
      },
    });
    expect(identity.verifiedAt).toBeTruthy();
  });

  it("rejects invalid codes", async () => {
    const res = await verifyEmail(post("http://test/api/auth/register/verify-email", {
      email: "pilot@example.com",
      code: "000000",
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_or_expired" });
  });
});
```

- [ ] **Step 2: Run route tests to verify RED**

Run:

```bash
pnpm vitest run app/api/auth/register/route.test.ts app/api/auth/register/verify-email/route.test.ts
```

Expected: FAIL because registration still returns `410` and the verify-email route does not exist.

- [ ] **Step 3: Implement registration and email verification routes**

Replace `app/api/auth/register/route.ts` with:

```ts
import { z } from "zod";
import { sendVerificationCode } from "../../../../src/lib/auth/delivery";
import { registerLocalAccount } from "../../../../src/lib/auth/localAccount";
import { requestVerificationCode } from "../../../../src/lib/auth/verificationCode";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(24).optional(),
  phone: z.string().min(7).optional(),
}).strict();

function statusForError(error: unknown): number {
  return error instanceof Error && (
    error.message === "email_already_registered" ||
    error.message === "username_unavailable" ||
    error.message === "phone_unavailable"
  )
    ? 409
    : 400;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RegisterBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const user = await registerLocalAccount(parsed.data);
    const requested = await requestVerificationCode({
      channel: "email",
      target: user.email ?? parsed.data.email,
    });
    await sendVerificationCode({
      channel: "email",
      target: requested.target,
      code: requested.code,
    });

    return Response.json({ ok: true, emailVerificationRequired: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "registration_failed";
    return Response.json({ error: message }, { status: statusForError(error) });
  }
}
```

Create `app/api/auth/register/verify-email/route.ts`:

```ts
import { z } from "zod";
import { verifyRegistrationEmail } from "../../../../../src/lib/auth/localAccount";

const VerifyEmailBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
}).strict();

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = VerifyEmailBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const verified = await verifyRegistrationEmail(parsed.data);
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run route tests to verify GREEN**

Run:

```bash
pnpm vitest run app/api/auth/register/route.test.ts app/api/auth/register/verify-email/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registration routes**

Run:

```bash
git add app/api/auth/register/route.ts app/api/auth/register/route.test.ts app/api/auth/register/verify-email/route.ts app/api/auth/register/verify-email/route.test.ts
git commit -m "feat: add password registration email verification"
```

---

### Task 3: Credentials Provider Login

**Files:**
- Modify: `auth.ts`
- Test: `src/lib/auth/localAccount.test.ts`

- [ ] **Step 1: Add a failing service test for wrong passwords and verified account login**

Append this test to `src/lib/auth/localAccount.test.ts`:

```ts
it("rejects wrong passwords for verified local accounts", async () => {
  const user = await registerLocalAccount({
    email: "pilot@example.com",
    password: "correct-password",
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date("2026-06-08T00:00:00.000Z") },
  });

  await expect(
    authorizeLocalPasswordLogin({
      email: "pilot@example.com",
      password: "wrong-password",
    }),
  ).resolves.toBeNull();
});
```

- [ ] **Step 2: Run the login tests to verify RED or existing GREEN**

Run:

```bash
pnpm vitest run src/lib/auth/localAccount.test.ts
```

Expected: PASS if Task 1 already covered the service behavior. If it fails, fix the service before touching `auth.ts`.

- [ ] **Step 3: Update NextAuth credentials provider**

In `auth.ts`, replace the credentials provider imports and first provider authorize block so it uses `authorizeLocalPasswordLogin`:

```ts
import { authorizeLocalPasswordLogin } from "./src/lib/auth/localAccount";
```

Use this credentials provider:

```ts
Credentials({
  credentials: {
    email: {},
    phone: {},
    username: {},
    password: {},
  },
  async authorize(creds) {
    const email = typeof creds?.email === "string" ? creds.email : undefined;
    const phone = typeof creds?.phone === "string" ? creds.phone : undefined;
    const username = typeof creds?.username === "string" ? creds.username : undefined;
    const password = typeof creds?.password === "string" ? creds.password : undefined;
    const user = await authorizeLocalPasswordLogin({ email, phone, username, password });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.displayName ?? user.username ?? undefined,
      accessTier: user.accessTier,
    };
  },
})
```

Remove the now-unused `prisma` and `verifyPassword` imports from `auth.ts`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit credentials login**

Run:

```bash
git add auth.ts src/lib/auth/localAccount.test.ts
git commit -m "feat: support password login aliases"
```

---

### Task 4: Retire Code-Login Routes

**Files:**
- Modify: `app/api/auth/code/request/route.ts`
- Modify: `app/api/auth/code/verify/route.ts`
- Modify: `app/api/auth/code/routes.test.ts`
- Modify: `app/api/auth/register/username/route.ts`
- Modify: `app/api/auth/register/username/route.test.ts`

- [ ] **Step 1: Update tests to expect retired endpoints**

Replace `app/api/auth/code/routes.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../src/lib/db";
import { POST as requestCode } from "./request/route";
import { POST as verifyCodeRoute } from "./verify/route";

describe("retired public code-login routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("does not allow requesting login codes", async () => {
    const res = await requestCode(
      new Request("http://test/api/auth/code/request", {
        method: "POST",
        body: JSON.stringify({ channel: "email", target: "pilot@example.com" }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "code login disabled" });
    expect(await prisma.verificationCode.count()).toBe(0);
  });

  it("does not allow verifying login codes into users", async () => {
    const res = await verifyCodeRoute(
      new Request("http://test/api/auth/code/verify", {
        method: "POST",
        body: JSON.stringify({
          channel: "email",
          target: "pilot@example.com",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "code login disabled" });
    expect(await prisma.user.count()).toBe(0);
  });
});
```

Replace `app/api/auth/register/username/route.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../../../src/lib/db";
import { GET as checkUsername } from "../../username/check/route";
import { POST as registerUsername } from "./route";

describe("username auth routes", () => {
  beforeEach(async () => {
    await prisma.verificationCode.deleteMany();
    await prisma.userIdentity.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("checks username availability", async () => {
    const available = await checkUsername(
      new Request("http://test/api/auth/username/check?username=pilotone"),
    );
    expect(await available.json()).toEqual({ available: true });

    await prisma.user.create({ data: { username: "pilotone", accessTier: "FREE" } });

    const taken = await checkUsername(
      new Request("http://test/api/auth/username/check?username=pilotone"),
    );
    expect(await taken.json()).toEqual({ available: false });
  });

  it("does not allow standalone username registration", async () => {
    const res = await registerUsername(
      new Request("http://test/api/auth/register/username", {
        method: "POST",
        body: JSON.stringify({ username: "pilotone" }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "username registration disabled" });
  });
});
```

- [ ] **Step 2: Run retired-route tests to verify RED**

Run:

```bash
pnpm vitest run app/api/auth/code/routes.test.ts app/api/auth/register/username/route.test.ts
```

Expected: FAIL because the old route handlers still create/request code-login behavior.

- [ ] **Step 3: Retire the route handlers**

Replace `app/api/auth/code/request/route.ts` with:

```ts
export async function POST(): Promise<Response> {
  return Response.json({ error: "code login disabled" }, { status: 410 });
}
```

Replace `app/api/auth/code/verify/route.ts` with:

```ts
export async function POST(): Promise<Response> {
  return Response.json({ error: "code login disabled" }, { status: 410 });
}
```

Replace `app/api/auth/register/username/route.ts` with:

```ts
export async function POST(): Promise<Response> {
  return Response.json({ error: "username registration disabled" }, { status: 410 });
}
```

- [ ] **Step 4: Run retired-route tests to verify GREEN**

Run:

```bash
pnpm vitest run app/api/auth/code/routes.test.ts app/api/auth/register/username/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit retired routes**

Run:

```bash
git add app/api/auth/code/request/route.ts app/api/auth/code/verify/route.ts app/api/auth/code/routes.test.ts app/api/auth/register/username/route.ts app/api/auth/register/username/route.test.ts
git commit -m "refactor: retire verification code login routes"
```

---

### Task 5: Auth Pages Use New APIs

**Files:**
- Modify: `app/[locale]/register/page.tsx`
- Modify: `app/[locale]/signin/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Run typecheck before UI edits**

Run:

```bash
pnpm typecheck
```

Expected: PASS before editing UI. If it fails, fix the auth API tasks first.

- [ ] **Step 2: Update register page**

Update `app/[locale]/register/page.tsx` so it:

- Collects `email`, `password`, optional `phone`, optional `username`, and `code`.
- Calls `POST /api/auth/register` before showing the verification-code field.
- Calls `POST /api/auth/register/verify-email`.
- Signs in with `signIn("credentials", { email, password, redirect: false })` after successful verification.

Keep the existing `auth-view`, `hud-panel`, `auth-card`, `auth-label`, `auth-input`, `btn-launch`, and `auth-link` classes.

- [ ] **Step 3: Update sign-in page**

Update `app/[locale]/signin/page.tsx` so it:

- Keeps Google and Apple buttons.
- Provides a local login mode for `email`, `phone`, or `username`.
- Sends exactly one of `email`, `phone`, or `username` plus `password` to `signIn("credentials", ...)`.
- Removes public code-login calls.

- [ ] **Step 4: Add only needed translation keys**

Add keys under `auth` in both message files:

```json
"emailVerificationRequired": "Check your email for the verification code.",
"verifyEmail": "Verify email",
"identifierType": "Login with",
"loginWithEmail": "Email",
"loginWithPhone": "Phone",
"loginWithUsername": "Username",
"emailVerified": "Email verified. Signing you in..."
```

Use equivalent concise Chinese strings in `messages/zh.json`.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit page integration**

Run:

```bash
git add app/[locale]/register/page.tsx app/[locale]/signin/page.tsx messages/en.json messages/zh.json
git commit -m "feat: update auth pages for password registration"
```

---

### Task 6: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused auth tests**

Run:

```bash
pnpm vitest run src/lib/auth/localAccount.test.ts app/api/auth/register/route.test.ts app/api/auth/register/verify-email/route.test.ts app/api/auth/code/routes.test.ts app/api/auth/register/username/route.test.ts
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
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Review git diff**

Run:

```bash
git status --short --branch
git diff --stat
```

Expected: only intentional auth/API/page changes remain uncommitted, or a clean branch aside from pre-existing unrelated edits.
