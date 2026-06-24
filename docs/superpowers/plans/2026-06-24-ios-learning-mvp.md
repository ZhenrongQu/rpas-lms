# iOS Learning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native SwiftUI iOS learning MVP backed by stable `/api/mobile/*` JSON APIs for login, dashboard, lessons, progress, checkpoints, and mock exams.

**Architecture:** Add a mobile API layer to the existing Next.js app and keep business rules in TypeScript services. The iOS app stores an opaque mobile session token in Keychain, calls `/api/mobile/*`, and renders native SwiftUI screens for the core learning flow. Keep the current Capacitor/WebView app runnable until the SwiftUI MVP completes the main flow.

**Tech Stack:** Next.js route handlers, Prisma, Vitest, TypeScript, SwiftUI, XCTest, URLSession async/await, Keychain Services.

---

## Scope Notes

The design spec spans backend API contracts and a new native iOS client. This plan keeps them in one sequence because the iOS MVP is not testable without the API contract, but each task produces independently verifiable software.

Do not touch unrelated existing dashboard/chat/dependency changes currently in the worktree. Stage only the files listed in each task.

## File Structure

Backend files to create:

- `src/lib/mobile/session.ts`: token generation, hashing, creation, lookup, revocation, and bearer parsing.
- `src/lib/mobile/session.test.ts`: mobile session unit tests.
- `app/api/mobile/auth/login/route.ts`: email/password login for native clients.
- `app/api/mobile/auth/logout/route.ts`: current token revocation.
- `app/api/mobile/me/route.ts`: session restore endpoint.
- `app/api/mobile/auth/routes.test.ts`: auth route tests.
- `src/lib/mobile/account.ts`: authenticated mobile account helper.
- `src/lib/mobile/dashboard.ts`: dashboard aggregation service.
- `src/lib/mobile/dashboard.test.ts`: dashboard service tests.
- `app/api/mobile/dashboard/route.ts`: Home tab payload endpoint.
- `src/lib/mobile/lessons.ts`: course and lesson JSON projection.
- `src/lib/mobile/lessons.test.ts`: lesson JSON projection tests.
- `app/api/mobile/courses/route.ts`: course list endpoint.
- `app/api/mobile/lessons/[lessonId]/route.ts`: lesson document endpoint.
- `app/api/mobile/progress/lesson/route.ts`: mobile lesson completion endpoint.
- `app/api/mobile/lessons/routes.test.ts`: courses, lesson, and progress route tests.
- `app/api/mobile/checkpoint/[id]/route.ts`: checkpoint fetch wrapper.
- `app/api/mobile/checkpoint/check/route.ts`: checkpoint answer wrapper.
- `app/api/mobile/checkpoint/routes.test.ts`: checkpoint route tests.
- `app/api/mobile/exam/route.ts`: mobile exam creation endpoint.
- `app/api/mobile/exam/[id]/questions/route.ts`: mobile exam questions endpoint.
- `app/api/mobile/exam/[id]/answer/route.ts`: mobile exam answer endpoint.
- `app/api/mobile/exam/[id]/submit/route.ts`: mobile exam submit endpoint.
- `app/api/mobile/exam/[id]/review/route.ts`: mobile exam review endpoint.
- `app/api/mobile/exam/routes.test.ts`: mobile exam route tests.

Backend files to modify:

- `prisma/schema.prisma`: add `MobileSession` model and relation to `Customer`.
- `src/lib/auth/localAccount.ts`: export `authorizeLocalPasswordLogin` is already exported; no change expected unless tests reveal a missing type export.

iOS files to create under `mobile/ios/App/App/`:

- `PacificDroneApp.swift`: SwiftUI app entry point.
- `AppRootView.swift`: session-based root switch.
- `Networking/APIClient.swift`: typed HTTP client.
- `Networking/APIModels.swift`: shared request/response models.
- `Auth/SessionStore.swift`: Keychain-backed token store.
- `Auth/AuthViewModel.swift`: login, restore, logout state.
- `Auth/LoginView.swift`: email/password login screen.
- `Home/HomeView.swift`: learning dashboard.
- `Learn/LearnView.swift`: course/module/lesson navigation.
- `Learn/LessonReaderView.swift`: native lesson reader.
- `Exam/ExamView.swift`: exam start, answering, submit, review flow.
- `Account/AccountView.swift`: profile and sign-out.
- `Design/AppTheme.swift`: color, spacing, and typography constants.

iOS files to modify:

- `mobile/ios/App/App/Info.plist`: remove storyboard main entry when SwiftUI entry is active.
- `mobile/ios/App/App.xcodeproj/project.pbxproj`: add Swift files to the App target and configure SwiftUI app lifecycle.
- `mobile/ios/App/Podfile`: remove Capacitor pods only after SwiftUI app builds without WebView. Keep pods during early tasks if project setup is fragile.

iOS test files to create under `mobile/ios/App/AppTests/`:

- `APIClientTests.swift`
- `SessionStoreTests.swift`
- `AuthViewModelTests.swift`
- `DashboardViewModelTests.swift`
- `ExamViewModelTests.swift`

## Task 1: Mobile Session Schema And Service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/mobile/session.ts`
- Create: `src/lib/mobile/session.test.ts`

- [ ] **Step 1: Add failing mobile session tests**

Create `src/lib/mobile/session.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  bearerToken,
  createMobileSession,
  hashMobileToken,
  readMobileSession,
  revokeMobileSession,
} from "./session";
import { prisma } from "../db";

vi.mock("../db", () => ({
  prisma: {
    mobileSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("mobile sessions", () => {
  it("hashes tokens with sha256 hex", () => {
    expect(hashMobileToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("creates an opaque token and stores only its hash", async () => {
    vi.mocked(prisma.mobileSession.create).mockResolvedValue({ id: "ms_1" } as never);
    const now = new Date("2026-06-24T00:00:00.000Z");

    const session = await createMobileSession({
      userId: "user_1",
      now: () => now,
      tokenFactory: () => "plain-token",
    });

    expect(session).toEqual({
      token: "plain-token",
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    });
    expect(prisma.mobileSession.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashMobileToken("plain-token"),
        userId: "user_1",
        expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      },
    });
  });

  it("returns null for missing, expired, or revoked sessions", async () => {
    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce(null);
    await expect(readMobileSession("missing", () => new Date())).resolves.toBeNull();

    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_1",
      userId: "user_1",
      tokenHash: hashMobileToken("expired"),
      expiresAt: new Date("2026-06-23T00:00:00.000Z"),
      revokedAt: null,
      user: { id: "user_1", email: "a@test.com", displayName: null, accessTier: "FREE" },
    } as never);
    await expect(readMobileSession("expired", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toBeNull();

    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_2",
      userId: "user_1",
      tokenHash: hashMobileToken("revoked"),
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      revokedAt: new Date("2026-06-24T00:00:00.000Z"),
      user: { id: "user_1", email: "a@test.com", displayName: null, accessTier: "FREE" },
    } as never);
    await expect(readMobileSession("revoked", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toBeNull();
  });

  it("returns the active user for a valid session", async () => {
    vi.mocked(prisma.mobileSession.findUnique).mockResolvedValueOnce({
      id: "ms_1",
      userId: "user_1",
      tokenHash: hashMobileToken("active"),
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
      revokedAt: null,
      user: { id: "user_1", email: "a@test.com", displayName: "A", accessTier: "PAID" },
    } as never);

    await expect(readMobileSession("active", () => new Date("2026-06-24T00:00:00.000Z"))).resolves.toEqual({
      userId: "user_1",
      email: "a@test.com",
      name: "A",
      accessTier: "PAID",
    });
  });

  it("revokes a token by hash", async () => {
    await revokeMobileSession("plain", () => new Date("2026-06-24T00:00:00.000Z"));
    expect(prisma.mobileSession.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashMobileToken("plain"), revokedAt: null },
      data: { revokedAt: new Date("2026-06-24T00:00:00.000Z") },
    });
  });

  it("parses bearer tokens", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer abc" }))).toBe("abc");
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm test src/lib/mobile/session.test.ts
```

Expected: FAIL because `src/lib/mobile/session.ts` does not exist.

- [ ] **Step 3: Add the Prisma model**

Modify `prisma/schema.prisma`, adding the relation to `Customer`:

```prisma
model Customer {
  id               String                   @id @default(cuid())
  userNumber       Int?                     @unique
  username         String?                  @unique
  email            String?                  @unique
  phone            String?                  @unique
  displayName      String?                  @map("name")
  hashedPassword   String?
  accessTier       String                   @default("FREE")
  stripeCustomerId String?
  emailVerifiedAt  DateTime?
  phoneVerifiedAt  DateTime?
  createdAt        DateTime                 @default(now())
  updatedAt        DateTime                 @updatedAt
  identities       UserIdentity[]
  examSessions     ExamSession[]
  mobileSessions   MobileSession[]
  basicProgress    BasicLessonProgress[]
  advancedProgress AdvancedLessonProgress[]
  payments         Payment[]
  entitlements     Entitlement[]
  flightReviewBooking FlightReviewBooking?
}
```

Add this model near the identity models:

```prisma
model MobileSession {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      Customer  @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
  @@index([revokedAt])
}
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
pnpm db:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 5: Implement the session service**

Create `src/lib/mobile/session.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import type { AccessTier } from "../exam/access";

const MOBILE_SESSION_DAYS = 30;

export type MobileAccount = {
  userId: string;
  email: string | null;
  name: string | null;
  accessTier: AccessTier;
};

export function hashMobileToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createMobileSession({
  userId,
  now = () => new Date(),
  tokenFactory = () => randomBytes(32).toString("base64url"),
}: {
  userId: string;
  now?: () => Date;
  tokenFactory?: () => string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = tokenFactory();
  const expiresAt = addDays(now(), MOBILE_SESSION_DAYS);

  await prisma.mobileSession.create({
    data: {
      tokenHash: hashMobileToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function readMobileSession(
  token: string,
  now: () => Date = () => new Date(),
): Promise<MobileAccount | null> {
  const row = await prisma.mobileSession.findUnique({
    where: { tokenHash: hashMobileToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          accessTier: true,
        },
      },
    },
  });

  if (!row || row.revokedAt || row.expiresAt <= now()) return null;

  return {
    userId: row.user.id,
    email: row.user.email,
    name: row.user.displayName,
    accessTier: row.user.accessTier === "PAID" ? "PAID" : "FREE",
  };
}

export async function revokeMobileSession(
  token: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  await prisma.mobileSession.updateMany({
    where: { tokenHash: hashMobileToken(token), revokedAt: null },
    data: { revokedAt: now() },
  });
}

export function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
```

- [ ] **Step 6: Run the session tests**

Run:

```bash
pnpm test src/lib/mobile/session.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add prisma/schema.prisma src/lib/mobile/session.ts src/lib/mobile/session.test.ts
git commit -m "feat(mobile): add native session service"
```

## Task 2: Mobile Auth Routes

**Files:**
- Create: `src/lib/mobile/account.ts`
- Create: `app/api/mobile/auth/login/route.ts`
- Create: `app/api/mobile/auth/logout/route.ts`
- Create: `app/api/mobile/me/route.ts`
- Create: `app/api/mobile/auth/routes.test.ts`

- [ ] **Step 1: Write failing auth route tests**

Create `app/api/mobile/auth/routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "../me/route";
import { authorizeLocalPasswordLogin } from "../../../../src/lib/auth/localAccount";
import { createMobileSession, readMobileSession, revokeMobileSession } from "../../../../src/lib/mobile/session";

vi.mock("../../../../src/lib/auth/localAccount", () => ({
  authorizeLocalPasswordLogin: vi.fn(),
}));

vi.mock("../../../../src/lib/mobile/session", () => ({
  createMobileSession: vi.fn(),
  readMobileSession: vi.fn(),
  revokeMobileSession: vi.fn(),
  bearerToken: (headers: Headers) => {
    const value = headers.get("authorization");
    return value?.startsWith("Bearer ") ? value.slice(7) : null;
  },
}));

describe("mobile auth routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs in with email and password", async () => {
    vi.mocked(authorizeLocalPasswordLogin).mockResolvedValue({
      id: "user_1",
      email: "learner@test.com",
      displayName: "Learner",
      accessTier: "PAID",
    } as never);
    vi.mocked(createMobileSession).mockResolvedValue({
      token: "mobile-token",
      expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    });

    const res = await login(new Request("http://test/api/mobile/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "learner@test.com", password: "secret123" }),
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: "mobile-token",
      expiresAt: "2026-07-24T00:00:00.000Z",
      user: {
        id: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "PAID",
      },
    });
  });

  it("rejects bad credentials", async () => {
    vi.mocked(authorizeLocalPasswordLogin).mockResolvedValue(null);

    const res = await login(new Request("http://test/api/mobile/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "learner@test.com", password: "wrong" }),
    }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid credentials" });
  });

  it("restores current account from bearer token", async () => {
    vi.mocked(readMobileSession).mockResolvedValue({
      userId: "user_1",
      email: "learner@test.com",
      name: "Learner",
      accessTier: "FREE",
    });

    const res = await me(new Request("http://test/api/mobile/me", {
      headers: { authorization: "Bearer mobile-token" },
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user_1",
        email: "learner@test.com",
        name: "Learner",
        accessTier: "FREE",
      },
    });
  });

  it("rejects missing bearer token on me", async () => {
    const res = await me(new Request("http://test/api/mobile/me"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "authentication required" });
  });

  it("revokes the current bearer token on logout", async () => {
    const res = await logout(new Request("http://test/api/mobile/auth/logout", {
      method: "POST",
      headers: { authorization: "Bearer mobile-token" },
    }));

    expect(res.status).toBe(200);
    expect(revokeMobileSession).toHaveBeenCalledWith("mobile-token");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the failing auth route tests**

Run:

```bash
pnpm test app/api/mobile/auth/routes.test.ts
```

Expected: FAIL because mobile auth routes do not exist.

- [ ] **Step 3: Add authenticated account helper**

Create `src/lib/mobile/account.ts`:

```ts
import { bearerToken, readMobileSession, type MobileAccount } from "./session";

export async function currentMobileAccount(req: Request): Promise<MobileAccount | null> {
  const token = bearerToken(req.headers);
  if (!token) return null;
  return readMobileSession(token);
}

export async function requireMobileAccount(req: Request): Promise<
  | { ok: true; account: MobileAccount }
  | { ok: false; response: Response }
> {
  const account = await currentMobileAccount(req);
  if (!account) {
    return {
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    };
  }
  return { ok: true, account };
}
```

- [ ] **Step 4: Add login route**

Create `app/api/mobile/auth/login/route.ts`:

```ts
import { z } from "zod";
import { authorizeLocalPasswordLogin } from "../../../../../src/lib/auth/localAccount";
import { createMobileSession } from "../../../../../src/lib/mobile/session";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(`mobile-login:ip:${clientIp(req)}`, {
    limit: 30,
    windowSec: 15 * 60,
    blockSec: 15 * 60,
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const user = await authorizeLocalPasswordLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: clientIp(req),
  });
  if (!user) return Response.json({ error: "invalid credentials" }, { status: 401 });

  const session = await createMobileSession({ userId: user.id });

  return Response.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.displayName,
      accessTier: user.accessTier === "PAID" ? "PAID" : "FREE",
    },
  });
}
```

- [ ] **Step 5: Add logout route**

Create `app/api/mobile/auth/logout/route.ts`:

```ts
import { bearerToken, revokeMobileSession } from "../../../../../src/lib/mobile/session";

export async function POST(req: Request): Promise<Response> {
  const token = bearerToken(req.headers);
  if (token) await revokeMobileSession(token);
  return Response.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 6: Add me route**

Create `app/api/mobile/me/route.ts`:

```ts
import { requireMobileAccount } from "../../../../src/lib/mobile/account";

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  return Response.json({
    user: {
      id: auth.account.userId,
      email: auth.account.email,
      name: auth.account.name,
      accessTier: auth.account.accessTier,
    },
  });
}
```

- [ ] **Step 7: Run auth route tests**

Run:

```bash
pnpm test app/api/mobile/auth/routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/mobile/account.ts app/api/mobile/auth/login/route.ts app/api/mobile/auth/logout/route.ts app/api/mobile/me/route.ts app/api/mobile/auth/routes.test.ts
git commit -m "feat(mobile): add native auth endpoints"
```

## Task 3: Dashboard Aggregation API

**Files:**
- Create: `src/lib/mobile/dashboard.ts`
- Create: `src/lib/mobile/dashboard.test.ts`
- Create: `app/api/mobile/dashboard/route.ts`

- [ ] **Step 1: Write failing dashboard service test**

Create `src/lib/mobile/dashboard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getMobileDashboard } from "./dashboard";
import { listCompletedLessonIds } from "../lessons/progress";
import { getCourseLessonCount } from "../lessons/catalog";
import { getResumeLesson } from "../lessons/resume";
import { listUserExamHistory } from "../exam/history";
import { canBookFlightReview } from "../payments/entitlements";
import { getUserBooking } from "../flightReview/booking";

vi.mock("../lessons/progress", () => ({ listCompletedLessonIds: vi.fn() }));
vi.mock("../lessons/catalog", () => ({ getCourseLessonCount: vi.fn() }));
vi.mock("../lessons/resume", () => ({ getResumeLesson: vi.fn() }));
vi.mock("../exam/history", () => ({ listUserExamHistory: vi.fn() }));
vi.mock("../payments/entitlements", () => ({ canBookFlightReview: vi.fn() }));
vi.mock("../flightReview/booking", () => ({ getUserBooking: vi.fn() }));

describe("getMobileDashboard", () => {
  it("returns progress, resume lesson, exam summary, and flight-review status", async () => {
    vi.mocked(listCompletedLessonIds).mockResolvedValue(["basic/air-law/intro"]);
    vi.mocked(getCourseLessonCount).mockResolvedValueOnce(4).mockResolvedValueOnce(6);
    vi.mocked(getResumeLesson).mockResolvedValue({ lessonId: "basic/weather/clouds", title: "Clouds" });
    vi.mocked(listUserExamHistory).mockResolvedValue([
      { id: "exam_1", certLevel: "BASIC", submitted: true, scorePct: 0.82, createdAt: new Date("2026-06-24T00:00:00.000Z") },
    ] as never);
    vi.mocked(canBookFlightReview).mockResolvedValue(false);
    vi.mocked(getUserBooking).mockResolvedValue(null);

    await expect(getMobileDashboard({
      userId: "user_1",
      locale: "en",
      accessTier: "FREE",
    })).resolves.toEqual({
      progress: {
        overallPct: 10,
        totalDone: 1,
        totalLessons: 10,
        basic: { done: 1, total: 4, pct: 25 },
        advanced: { done: 0, total: 6, pct: 0, locked: true },
      },
      resume: {
        course: "basic",
        lessonId: "basic/weather/clouds",
        title: "Clouds",
        courseTitle: "Basic",
        pct: 25,
      },
      mockExam: {
        bestPct: 82,
        recentCount: 1,
      },
      flightReview: {
        status: "locked",
        booking: null,
      },
    });
  });
});
```

- [ ] **Step 2: Run failing dashboard test**

Run:

```bash
pnpm test src/lib/mobile/dashboard.test.ts
```

Expected: FAIL because `src/lib/mobile/dashboard.ts` does not exist.

- [ ] **Step 3: Implement dashboard service**

Create `src/lib/mobile/dashboard.ts`:

```ts
import { getCourseLessonCount } from "../lessons/catalog";
import { listCompletedLessonIds } from "../lessons/progress";
import { getResumeLesson } from "../lessons/resume";
import { listUserExamHistory } from "../exam/history";
import { canBookFlightReview } from "../payments/entitlements";
import { getUserBooking } from "../flightReview/booking";
import type { AccessTier } from "../exam/access";
import type { Course, RouteLocale } from "../lessons/types";

type Input = {
  userId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
};

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export async function getMobileDashboard({ userId, locale, accessTier }: Input) {
  const [completedIds, basicTotal, advancedTotal, examItems, frEligible, frBooking] =
    await Promise.all([
      listCompletedLessonIds(userId),
      getCourseLessonCount("basic"),
      getCourseLessonCount("advanced"),
      listUserExamHistory(userId, 5),
      canBookFlightReview(userId),
      getUserBooking(userId),
    ]);

  const completed = new Set(completedIds);
  const basicDone = completedIds.filter((id) => id.startsWith("basic/")).length;
  const advancedDone = completedIds.filter((id) => id.startsWith("advanced/")).length;
  const basicPct = pct(basicDone, basicTotal);
  const advancedPct = pct(advancedDone, advancedTotal);
  const totalDone = basicDone + advancedDone;
  const totalLessons = basicTotal + advancedTotal;

  let resumeCourse: Course | null = null;
  if (basicDone < basicTotal) resumeCourse = "basic";
  else if (accessTier === "PAID" && advancedDone < advancedTotal) resumeCourse = "advanced";

  const resumeLesson = resumeCourse
    ? await getResumeLesson(locale, resumeCourse, completed)
    : null;

  const submittedScores = examItems
    .filter((item) => item.submitted && item.scorePct !== null)
    .map((item) => Math.round((item.scorePct as number) * 100));

  return {
    progress: {
      overallPct: pct(totalDone, totalLessons),
      totalDone,
      totalLessons,
      basic: { done: basicDone, total: basicTotal, pct: basicPct },
      advanced: {
        done: advancedDone,
        total: advancedTotal,
        pct: advancedPct,
        locked: accessTier !== "PAID",
      },
    },
    resume: resumeLesson && resumeCourse ? {
      course: resumeCourse,
      lessonId: resumeLesson.lessonId,
      title: resumeLesson.title,
      courseTitle: resumeCourse === "basic" ? "Basic" : "Advanced",
      pct: resumeCourse === "basic" ? basicPct : advancedPct,
    } : null,
    mockExam: {
      bestPct: submittedScores.length ? Math.max(...submittedScores) : null,
      recentCount: examItems.length,
    },
    flightReview: {
      status: frBooking ? "booked" : frEligible ? "eligible" : "locked",
      booking: frBooking,
    },
  };
}
```

- [ ] **Step 4: Add dashboard route**

Create `app/api/mobile/dashboard/route.ts`:

```ts
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { getMobileDashboard } from "../../../../src/lib/mobile/dashboard";
import type { RouteLocale } from "../../../../src/lib/lessons/types";

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const dashboard = await getMobileDashboard({
    userId: auth.account.userId,
    accessTier: auth.account.accessTier,
    locale: localeFrom(req),
  });

  return Response.json({
    user: {
      id: auth.account.userId,
      email: auth.account.email,
      name: auth.account.name,
      accessTier: auth.account.accessTier,
    },
    ...dashboard,
  });
}
```

- [ ] **Step 5: Run dashboard test**

Run:

```bash
pnpm test src/lib/mobile/dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/mobile/dashboard.ts src/lib/mobile/dashboard.test.ts app/api/mobile/dashboard/route.ts
git commit -m "feat(mobile): add learning dashboard API"
```

## Task 4: Courses, Lessons, And Progress APIs

**Files:**
- Create: `src/lib/mobile/lessons.ts`
- Create: `src/lib/mobile/lessons.test.ts`
- Create: `app/api/mobile/courses/route.ts`
- Create: `app/api/mobile/lessons/[lessonId]/route.ts`
- Create: `app/api/mobile/progress/lesson/route.ts`
- Create: `app/api/mobile/lessons/routes.test.ts`

- [ ] **Step 1: Write failing lesson projection test**

Create `src/lib/mobile/lessons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mdxToMobileBlocks } from "./lessons";

describe("mdxToMobileBlocks", () => {
  it("projects the supported MDX subset into mobile blocks", () => {
    expect(mdxToMobileBlocks(`# Title

Paragraph one.

## Section

- First
- Second

<Callout type="tip">Remember the rule.</Callout>
`)).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Paragraph one." },
      { type: "heading", level: 2, text: "Section" },
      { type: "list", ordered: false, items: ["First", "Second"] },
      { type: "callout", tone: "tip", text: "Remember the rule." },
    ]);
  });
});
```

- [ ] **Step 2: Run failing lesson projection test**

Run:

```bash
pnpm test src/lib/mobile/lessons.test.ts
```

Expected: FAIL because `src/lib/mobile/lessons.ts` does not exist.

- [ ] **Step 3: Implement lesson projection service**

Create `src/lib/mobile/lessons.ts`:

```ts
import { getCourseLessonCount, getCourseModules, getLesson, getModuleLessons } from "../lessons/catalog";
import { listCompletedLessonIds, lessonExists, markLessonComplete } from "../lessons/progress";
import type { AccessTier } from "../exam/access";
import type { Course, RouteLocale } from "../lessons/types";

export type MobileLessonBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "callout"; tone: "tip" | "caution" | "note"; text: string };

export function mdxToMobileBlocks(body: string): MobileLessonBlock[] {
  const blocks: MobileLessonBlock[] = [];
  const lines = body.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let ordered = false;

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length) {
      blocks.push({ type: "list", ordered, items: listItems });
      listItems = [];
      ordered = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const callout = line.match(/^<Callout type="(tip|caution|note)">(.+)<\/Callout>$/);
    if (callout) {
      flushParagraph();
      flushList();
      blocks.push({ type: "callout", tone: callout[1] as "tip" | "caution" | "note", text: callout[2] });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      ordered = false;
      listItems.push(bullet[1]);
      continue;
    }

    const number = line.match(/^\d+\.\s+(.+)$/);
    if (number) {
      flushParagraph();
      ordered = true;
      listItems.push(number[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function parseLessonId(lessonId: string): { course: Course; moduleId: string; slug: string } | null {
  const [course, moduleId, slug] = lessonId.split("/");
  if ((course !== "basic" && course !== "advanced") || !moduleId || !slug) return null;
  return { course, moduleId, slug };
}

export async function getMobileCourses({
  userId,
  locale,
  accessTier,
}: {
  userId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
}) {
  const completed = new Set(await listCompletedLessonIds(userId));
  const courses: Course[] = ["basic", "advanced"];

  return Promise.all(courses.map(async (course) => {
    const modules = await getCourseModules(locale, course);
    const lessonTotal = await getCourseLessonCount(course);
    const done = [...completed].filter((id) => id.startsWith(`${course}/`)).length;
    return {
      course,
      title: course === "basic" ? "Basic" : "Advanced",
      locked: course === "advanced" && accessTier !== "PAID",
      done,
      total: lessonTotal,
      modules: await Promise.all(modules.map(async (moduleId) => ({
        moduleId,
        lessons: (await getModuleLessons(locale, course, moduleId)).map((lesson) => ({
          ...lesson,
          completed: completed.has(lesson.lessonId),
        })),
      }))),
    };
  }));
}

export async function getMobileLesson({
  userId,
  lessonId,
  locale,
  accessTier,
}: {
  userId: string;
  lessonId: string;
  locale: RouteLocale;
  accessTier: AccessTier;
}) {
  const parsed = parseLessonId(lessonId);
  if (!parsed) return null;
  if (parsed.course === "advanced" && accessTier !== "PAID") return { locked: true as const };

  const lesson = await getLesson(locale, parsed.course, parsed.moduleId, parsed.slug);
  if (!lesson) return null;

  const completed = new Set(await listCompletedLessonIds(userId));
  return {
    locked: false as const,
    meta: lesson.meta,
    completed: completed.has(lessonId),
    blocks: mdxToMobileBlocks(lesson.body),
  };
}

export async function completeMobileLesson(userId: string, lessonId: string): Promise<"ok" | "not_found"> {
  if (!(await lessonExists(lessonId))) return "not_found";
  await markLessonComplete(userId, lessonId);
  return "ok";
}
```

- [ ] **Step 4: Run lesson projection test**

Run:

```bash
pnpm test src/lib/mobile/lessons.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add courses route**

Create `app/api/mobile/courses/route.ts`:

```ts
import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { getMobileCourses } from "../../../../src/lib/mobile/lessons";
import type { RouteLocale } from "../../../../src/lib/lessons/types";

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const courses = await getMobileCourses({
    userId: auth.account.userId,
    locale: localeFrom(req),
    accessTier: auth.account.accessTier,
  });

  return Response.json({ courses }, { status: 200 });
}
```

- [ ] **Step 6: Add lesson route**

Create `app/api/mobile/lessons/[lessonId]/route.ts`:

```ts
import { requireMobileAccount } from "../../../../../src/lib/mobile/account";
import { getMobileLesson } from "../../../../../src/lib/mobile/lessons";
import type { RouteLocale } from "../../../../../src/lib/lessons/types";

type Ctx = { params: Promise<{ lessonId: string }> };

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const { lessonId } = await ctx.params;
  const lesson = await getMobileLesson({
    userId: auth.account.userId,
    lessonId: decodeURIComponent(lessonId),
    locale: localeFrom(req),
    accessTier: auth.account.accessTier,
  });

  if (!lesson) return Response.json({ error: "lesson not found" }, { status: 404 });
  if (lesson.locked) return Response.json({ error: "upgrade required" }, { status: 403 });

  return Response.json(lesson, { status: 200 });
}
```

- [ ] **Step 7: Add progress route**

Create `app/api/mobile/progress/lesson/route.ts`:

```ts
import { z } from "zod";
import { requireMobileAccount } from "../../../../../src/lib/mobile/account";
import { completeMobileLesson } from "../../../../../src/lib/mobile/lessons";

const Body = z.object({ lessonId: z.string().min(1) }).strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const result = await completeMobileLesson(auth.account.userId, parsed.data.lessonId);
  if (result === "not_found") return Response.json({ error: "lesson not found" }, { status: 404 });

  return Response.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/mobile/lessons.ts src/lib/mobile/lessons.test.ts app/api/mobile/courses/route.ts app/api/mobile/lessons/[lessonId]/route.ts app/api/mobile/progress/lesson/route.ts
git commit -m "feat(mobile): add course and lesson APIs"
```

## Task 5: Mobile Checkpoint APIs

**Files:**
- Create: `app/api/mobile/checkpoint/[id]/route.ts`
- Create: `app/api/mobile/checkpoint/check/route.ts`
- Create: `app/api/mobile/checkpoint/routes.test.ts`

- [ ] **Step 1: Write checkpoint route tests**

Create `app/api/mobile/checkpoint/routes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GET } from "./[id]/route";
import { POST } from "./check/route";
import { findActiveCheckpoint } from "../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../src/lib/exam/serialize";
import { isAnswerCorrect } from "../../../../src/lib/exam/grade";

vi.mock("../../../../src/lib/content/loadBank", () => ({ findActiveCheckpoint: vi.fn() }));
vi.mock("../../../../src/lib/exam/serialize", () => ({ toPublicQuestion: vi.fn((q) => ({ id: q.id })) }));
vi.mock("../../../../src/lib/exam/grade", () => ({ isAnswerCorrect: vi.fn() }));

describe("mobile checkpoints", () => {
  it("fetches a public checkpoint", async () => {
    vi.mocked(findActiveCheckpoint).mockResolvedValue({ id: "cp_1" } as never);

    const res = await GET(new Request("http://test/api/mobile/checkpoint/cp_1?locale=en"), {
      params: Promise.resolve({ id: "cp_1" }),
    });

    expect(res.status).toBe(200);
    expect(toPublicQuestion).toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ id: "cp_1" });
  });

  it("checks an answer after fetching the checkpoint", async () => {
    vi.mocked(findActiveCheckpoint).mockResolvedValue({
      id: "cp_1",
      explanation: { EN: "Because", ZH: "Because zh" },
      reference: { EN: "CARs", ZH: "CARs zh" },
    } as never);
    vi.mocked(isAnswerCorrect).mockReturnValue(true);

    const res = await POST(new Request("http://test/api/mobile/checkpoint/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "cp_1", selectedOptionIds: ["a"], locale: "EN" }),
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      explanation: "Because",
      reference: "CARs",
    });
  });
});
```

- [ ] **Step 2: Run failing checkpoint tests**

Run:

```bash
pnpm test app/api/mobile/checkpoint/routes.test.ts
```

Expected: FAIL because mobile checkpoint routes do not exist.

- [ ] **Step 3: Add checkpoint fetch route**

Create `app/api/mobile/checkpoint/[id]/route.ts`:

```ts
import { findActiveCheckpoint } from "../../../../../src/lib/content/loadBank";
import { toPublicQuestion } from "../../../../../src/lib/exam/serialize";
import { clientIp, enforceRateLimit } from "../../../../../src/lib/security/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const limited = await enforceRateLimit(`mobile-checkpoint:ip:${clientIp(req)}`, {
    limit: 120,
    windowSec: 60,
    blockSec: 60,
  });
  if (limited) return limited;

  const { id } = await ctx.params;
  const locale = new URL(req.url).searchParams.get("locale") === "zh" ? "ZH" : "EN";
  const question = await findActiveCheckpoint(id);
  if (!question) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json(toPublicQuestion(question, locale), { status: 200 });
}
```

- [ ] **Step 4: Add checkpoint answer route**

Create `app/api/mobile/checkpoint/check/route.ts`:

```ts
import { z } from "zod";
import { findActiveCheckpoint } from "../../../../../src/lib/content/loadBank";
import { isAnswerCorrect } from "../../../../../src/lib/exam/grade";

const Body = z.object({
  id: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
  locale: z.enum(["EN", "ZH"]).default("EN"),
}).strict();

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const question = await findActiveCheckpoint(parsed.data.id);
  if (!question) return Response.json({ error: "not found" }, { status: 404 });

  const locale = parsed.data.locale;
  return Response.json({
    ok: isAnswerCorrect(question, parsed.data.selectedOptionIds),
    explanation: question.explanation[locale],
    reference: question.reference[locale],
  }, { status: 200 });
}
```

- [ ] **Step 5: Run checkpoint tests**

Run:

```bash
pnpm test app/api/mobile/checkpoint/routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add app/api/mobile/checkpoint/[id]/route.ts app/api/mobile/checkpoint/check/route.ts app/api/mobile/checkpoint/routes.test.ts
git commit -m "feat(mobile): add checkpoint APIs"
```

## Task 6: Mobile Exam APIs With Token Auth

**Files:**
- Create: `app/api/mobile/exam/route.ts`
- Create: `app/api/mobile/exam/[id]/questions/route.ts`
- Create: `app/api/mobile/exam/[id]/answer/route.ts`
- Create: `app/api/mobile/exam/[id]/submit/route.ts`
- Create: `app/api/mobile/exam/[id]/review/route.ts`
- Create: `app/api/mobile/exam/routes.test.ts`

- [ ] **Step 1: Write mobile exam route tests**

Create `app/api/mobile/exam/routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as createExam } from "./route";
import { GET as getQuestions } from "./[id]/questions/route";
import { POST as answerQuestion } from "./[id]/answer/route";
import { POST as submitExam } from "./[id]/submit/route";
import { GET as reviewExam } from "./[id]/review/route";
import { readMobileSession } from "../../../../src/lib/mobile/session";
import { examService } from "../../../../src/lib/exam/instance";

vi.mock("../../../../src/lib/mobile/session", () => ({
  readMobileSession: vi.fn(),
  bearerToken: (headers: Headers) => {
    const value = headers.get("authorization");
    return value?.startsWith("Bearer ") ? value.slice(7) : null;
  },
}));

vi.mock("../../../../src/lib/exam/instance", () => ({
  examService: {
    createMock: vi.fn(),
    getSessionUserId: vi.fn(),
    getPublicQuestions: vi.fn(),
    answer: vi.fn(),
    submitWithIncorrectReview: vi.fn(),
    getReview: vi.fn(),
  },
}));

describe("mobile exam routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMobileSession).mockResolvedValue({
      userId: "user_1",
      email: "learner@test.com",
      name: "Learner",
      accessTier: "FREE",
    });
  });

  it("creates a basic exam for a signed-in user", async () => {
    vi.mocked(examService.createMock).mockResolvedValue({
      sessionId: "exam_1",
      expiresAt: 1782267453000,
      total: 35,
    });

    const res = await createExam(new Request("http://test/api/mobile/exam", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ certLevel: "BASIC", locale: "EN" }),
    }));

    expect(res.status).toBe(201);
    expect(examService.createMock).toHaveBeenCalledWith("BASIC", "EN", undefined, "user_1", "FREE");
  });

  it("denies advanced exam for free user", async () => {
    const res = await createExam(new Request("http://test/api/mobile/exam", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ certLevel: "ADVANCED", locale: "EN" }),
    }));

    expect(res.status).toBe(403);
  });

  it("returns questions for the owning user", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.getPublicQuestions).mockResolvedValue([{ id: "q1" }] as never);

    const res = await getQuestions(new Request("http://test/api/mobile/exam/exam_1/questions", {
      headers: { authorization: "Bearer token" },
    }), { params: Promise.resolve({ id: "exam_1" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: "q1" }]);
  });

  it("answers and submits", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.answer).mockResolvedValue(true);
    vi.mocked(examService.submitWithIncorrectReview).mockResolvedValue({
      result: { correct: 1, total: 1, scorePct: 1, passed: true },
      incorrectReview: [],
    } as never);

    const answerRes = await answerQuestion(new Request("http://test/api/mobile/exam/exam_1/answer", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ questionId: "q1", selectedOptionIds: ["a"] }),
    }), { params: Promise.resolve({ id: "exam_1" }) });
    expect(answerRes.status).toBe(200);

    const submitRes = await submitExam(new Request("http://test/api/mobile/exam/exam_1/submit", {
      method: "POST",
      headers: { authorization: "Bearer token" },
    }), { params: Promise.resolve({ id: "exam_1" }) });
    expect(submitRes.status).toBe(200);
  });

  it("returns review for the owning user", async () => {
    vi.mocked(examService.getSessionUserId).mockResolvedValue("user_1");
    vi.mocked(examService.getReview).mockResolvedValue([{ id: "q1" }] as never);

    const res = await reviewExam(new Request("http://test/api/mobile/exam/exam_1/review", {
      headers: { authorization: "Bearer token" },
    }), { params: Promise.resolve({ id: "exam_1" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: "q1" }]);
  });
});
```

- [ ] **Step 2: Run failing exam tests**

Run:

```bash
pnpm test app/api/mobile/exam/routes.test.ts
```

Expected: FAIL because mobile exam routes do not exist.

- [ ] **Step 3: Add shared owner helper inside each route file**

Use this helper pattern in question, answer, submit, and review routes:

```ts
async function requireOwner(req: Request, sessionId: string) {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth;

  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) {
    return { ok: false as const, response: Response.json({ error: "session not found" }, { status: 404 }) };
  }
  if (ownerId !== auth.account.userId) {
    return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, account: auth.account };
}
```

- [ ] **Step 4: Add exam create route**

Create `app/api/mobile/exam/route.ts`:

```ts
import { z } from "zod";
import { examService } from "../../../../src/lib/exam/instance";
import { canCreateExam } from "../../../../src/lib/exam/access";
import { requireMobileAccount } from "../../../../src/lib/mobile/account";

const Body = z.object({
  certLevel: z.enum(["BASIC", "ADVANCED"]),
  locale: z.enum(["EN", "ZH"]),
  seed: z.number().int().optional(),
}).strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  if (!canCreateExam(auth.account.accessTier, parsed.data.certLevel)) {
    return Response.json({ error: "upgrade required" }, { status: 403 });
  }

  const created = await examService.createMock(
    parsed.data.certLevel,
    parsed.data.locale,
    parsed.data.seed,
    auth.account.userId,
    auth.account.accessTier,
  );

  return Response.json(created, { status: 201 });
}
```

- [ ] **Step 5: Add questions, answer, submit, and review routes**

Create `app/api/mobile/exam/[id]/questions/route.ts`:

```ts
import { examService } from "../../../../../../src/lib/exam/instance";
import { requireMobileAccount } from "../../../../../../src/lib/mobile/account";

type Ctx = { params: Promise<{ id: string }> };

async function requireOwner(req: Request, sessionId: string) {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth;
  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) return { ok: false as const, response: Response.json({ error: "session not found" }, { status: 404 }) };
  if (ownerId !== auth.account.userId) return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true as const, account: auth.account };
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const owner = await requireOwner(req, id);
  if (!owner.ok) return owner.response;
  const questions = await examService.getPublicQuestions(id);
  if (questions === null) return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(questions, { status: 200 });
}
```

Create `app/api/mobile/exam/[id]/answer/route.ts`:

```ts
import { z } from "zod";
import { examService } from "../../../../../../src/lib/exam/instance";
import { requireMobileAccount } from "../../../../../../src/lib/mobile/account";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()),
}).strict();

async function requireOwner(req: Request, sessionId: string) {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth;
  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) return { ok: false as const, response: Response.json({ error: "session not found" }, { status: 404 }) };
  if (ownerId !== auth.account.userId) return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true as const, account: auth.account };
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const owner = await requireOwner(req, id);
  if (!owner.ok) return owner.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const ok = await examService.answer(id, parsed.data.questionId, parsed.data.selectedOptionIds);
  if (!ok) return Response.json({ error: "answer rejected" }, { status: 409 });
  return Response.json({ ok: true }, { status: 200 });
}
```

Create `app/api/mobile/exam/[id]/submit/route.ts`:

```ts
import { examService } from "../../../../../../src/lib/exam/instance";
import { requireMobileAccount } from "../../../../../../src/lib/mobile/account";

type Ctx = { params: Promise<{ id: string }> };

async function requireOwner(req: Request, sessionId: string) {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth;
  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) return { ok: false as const, response: Response.json({ error: "session not found" }, { status: 404 }) };
  if (ownerId !== auth.account.userId) return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true as const, account: auth.account };
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const owner = await requireOwner(req, id);
  if (!owner.ok) return owner.response;
  const submitted = await examService.submitWithIncorrectReview(id);
  if (submitted === null) return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(submitted, { status: 200 });
}
```

Create `app/api/mobile/exam/[id]/review/route.ts`:

```ts
import { examService } from "../../../../../../src/lib/exam/instance";
import { requireMobileAccount } from "../../../../../../src/lib/mobile/account";

type Ctx = { params: Promise<{ id: string }> };

async function requireOwner(req: Request, sessionId: string) {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth;
  const ownerId = await examService.getSessionUserId(sessionId);
  if (ownerId === undefined) return { ok: false as const, response: Response.json({ error: "session not found" }, { status: 404 }) };
  if (ownerId !== auth.account.userId) return { ok: false as const, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true as const, account: auth.account };
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const owner = await requireOwner(req, id);
  if (!owner.ok) return owner.response;
  const review = await examService.getReview(id);
  if (review === null) return Response.json({ error: "not submitted or session not found" }, { status: 404 });
  return Response.json(review, { status: 200 });
}
```

- [ ] **Step 6: Run mobile exam tests**

Run:

```bash
pnpm test app/api/mobile/exam/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/api/mobile/exam/route.ts app/api/mobile/exam/[id]/questions/route.ts app/api/mobile/exam/[id]/answer/route.ts app/api/mobile/exam/[id]/submit/route.ts app/api/mobile/exam/[id]/review/route.ts app/api/mobile/exam/routes.test.ts
git commit -m "feat(mobile): add exam APIs"
```

## Task 7: SwiftUI Project Entry And Networking Foundation

**Files:**
- Create: `mobile/ios/App/App/PacificDroneApp.swift`
- Create: `mobile/ios/App/App/AppRootView.swift`
- Create: `mobile/ios/App/App/Design/AppTheme.swift`
- Create: `mobile/ios/App/App/Networking/APIModels.swift`
- Create: `mobile/ios/App/App/Networking/APIClient.swift`
- Create: `mobile/ios/App/App/Auth/SessionStore.swift`
- Create: `mobile/ios/App/AppTests/APIClientTests.swift`
- Create: `mobile/ios/App/AppTests/SessionStoreTests.swift`
- Modify: `mobile/ios/App/App/Info.plist`
- Modify: `mobile/ios/App/App.xcodeproj/project.pbxproj`

- [ ] **Step 1: Add Swift networking and session tests**

Create `mobile/ios/App/AppTests/APIClientTests.swift`:

```swift
import XCTest
@testable import App

final class APIClientTests: XCTestCase {
    func testBuildsAuthorizedRequest() throws {
        let client = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
        var request = try client.request(path: "/api/mobile/me", method: "GET", token: "abc")

        XCTAssertEqual(request.url?.absoluteString, "https://pacificdrone.ca/api/mobile/me")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer abc")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
    }
}
```

Create `mobile/ios/App/AppTests/SessionStoreTests.swift`:

```swift
import XCTest
@testable import App

final class SessionStoreTests: XCTestCase {
    func testInMemoryStoreSavesAndClearsToken() throws {
        let store = InMemorySessionStore()
        XCTAssertNil(store.token)

        store.save(token: "abc")
        XCTAssertEqual(store.token, "abc")

        store.clear()
        XCTAssertNil(store.token)
    }
}
```

- [ ] **Step 2: Run failing iOS tests**

Run:

```bash
xcodebuild test -workspace mobile/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: FAIL because Swift files and tests are not wired into the Xcode project yet. If the simulator name differs, run `xcrun simctl list devices available` and use an installed iPhone simulator.

- [ ] **Step 3: Add SwiftUI app entry**

Create `mobile/ios/App/App/PacificDroneApp.swift`:

```swift
import SwiftUI

@main
struct PacificDroneApp: App {
    @StateObject private var auth = AuthViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!),
        sessionStore: KeychainSessionStore()
    )

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(auth)
                .task {
                    await auth.restore()
                }
        }
    }
}
```

Create `mobile/ios/App/App/AppRootView.swift`:

```swift
import SwiftUI

struct AppRootView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        Group {
            switch auth.state {
            case .checking:
                ProgressView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
    }
}
```

- [ ] **Step 4: Add theme**

Create `mobile/ios/App/App/Design/AppTheme.swift`:

```swift
import SwiftUI

enum AppTheme {
    static let paper = Color(red: 0.984, green: 0.984, blue: 0.976)
    static let surface = Color.white
    static let ink = Color(red: 0.078, green: 0.129, blue: 0.239)
    static let secondaryInk = Color(red: 0.255, green: 0.314, blue: 0.420)
    static let accent = Color(red: 0.722, green: 0.314, blue: 0.118)
    static let accentSoft = Color(red: 0.969, green: 0.922, blue: 0.886)
    static let green = Color(red: 0.118, green: 0.478, blue: 0.302)
    static let border = Color(red: 0.902, green: 0.894, blue: 0.863)
}
```

- [ ] **Step 5: Add API models and client**

Create `mobile/ios/App/App/Networking/APIModels.swift`:

```swift
import Foundation

struct MobileUser: Codable, Equatable {
    let id: String
    let email: String?
    let name: String?
    let accessTier: String
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Codable, Equatable {
    let token: String
    let expiresAt: Date
    let user: MobileUser
}

struct MeResponse: Codable, Equatable {
    let user: MobileUser
}

struct DashboardResponse: Codable, Equatable {
    let user: MobileUser
    let progress: ProgressSummary
    let resume: ResumeLesson?
    let mockExam: MockExamSummary
}

struct ProgressSummary: Codable, Equatable {
    let overallPct: Int
    let totalDone: Int
    let totalLessons: Int
}

struct ResumeLesson: Codable, Equatable {
    let course: String
    let lessonId: String
    let title: String
    let courseTitle: String
    let pct: Int
}

struct MockExamSummary: Codable, Equatable {
    let bestPct: Int?
    let recentCount: Int
}
```

Create `mobile/ios/App/App/Networking/APIClient.swift`:

```swift
import Foundation

enum APIError: Error, Equatable {
    case invalidURL
    case badStatus(Int)
}

struct APIClient {
    let baseURL: URL
    var session: URLSession = .shared

    func request(path: String, method: String, token: String? = nil) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        token: String? = nil,
        body: Body
    ) async throws -> Response {
        var request = try self.request(path: path, method: method, token: token)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await perform(request)
    }

    func get<Response: Decodable>(path: String, token: String? = nil) async throws -> Response {
        let request = try self.request(path: path, method: "GET", token: token)
        return try await perform(request)
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError.badStatus(status) }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }
}
```

- [ ] **Step 6: Add session stores**

Create `mobile/ios/App/App/Auth/SessionStore.swift`:

```swift
import Foundation
import Security

protocol SessionStoring {
    var token: String? { get }
    func save(token: String)
    func clear()
}

final class InMemorySessionStore: SessionStoring {
    private(set) var token: String?

    func save(token: String) {
        self.token = token
    }

    func clear() {
        token = nil
    }
}

final class KeychainSessionStore: SessionStoring {
    private let service = "ca.pacificdrone.app"
    private let account = "mobile-session-token"

    var token: String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(token: String) {
        clear()
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

- [ ] **Step 7: Wire Swift files into Xcode project**

Open `mobile/ios/App/App.xcodeproj/project.pbxproj` and add all new Swift files to the App target's Sources build phase. Add `mobile/ios/App/AppTests` as a test target if it is not already present. Set the App target to use `PacificDroneApp` as the SwiftUI entry point.

Remove `UIMainStoryboardFile` from `mobile/ios/App/App/Info.plist` once the SwiftUI entry compiles:

```xml
<key>UILaunchStoryboardName</key>
<string>LaunchScreen</string>
```

Keep `UILaunchStoryboardName`; remove only the `UIMainStoryboardFile` key and its `Main` string.

- [ ] **Step 8: Run iOS tests**

Run:

```bash
xcodebuild test -workspace mobile/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS for `APIClientTests` and `SessionStoreTests`.

- [ ] **Step 9: Commit**

Run:

```bash
git add mobile/ios/App/App/PacificDroneApp.swift mobile/ios/App/App/AppRootView.swift mobile/ios/App/App/Design/AppTheme.swift mobile/ios/App/App/Networking/APIModels.swift mobile/ios/App/App/Networking/APIClient.swift mobile/ios/App/App/Auth/SessionStore.swift mobile/ios/App/AppTests/APIClientTests.swift mobile/ios/App/AppTests/SessionStoreTests.swift mobile/ios/App/App/Info.plist mobile/ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat(ios): add SwiftUI app foundation"
```

## Task 8: iOS Auth And Main Tabs

**Files:**
- Create: `mobile/ios/App/App/Auth/AuthViewModel.swift`
- Create: `mobile/ios/App/App/Auth/LoginView.swift`
- Create: `mobile/ios/App/App/MainTabView.swift`
- Create: `mobile/ios/App/App/Home/HomeView.swift`
- Create: `mobile/ios/App/App/Learn/LearnView.swift`
- Create: `mobile/ios/App/App/Exam/ExamView.swift`
- Create: `mobile/ios/App/App/Account/AccountView.swift`
- Create: `mobile/ios/App/AppTests/AuthViewModelTests.swift`
- Modify: `mobile/ios/App/App.xcodeproj/project.pbxproj`

- [ ] **Step 1: Add AuthViewModel test**

Create `mobile/ios/App/AppTests/AuthViewModelTests.swift`:

```swift
import XCTest
@testable import App

final class AuthViewModelTests: XCTestCase {
    func testLogoutClearsSession() async {
        let store = InMemorySessionStore()
        store.save(token: "abc")
        let viewModel = AuthViewModel(api: APIClient(baseURL: URL(string: "https://example.com")!), sessionStore: store)

        await viewModel.signOut()

        XCTAssertNil(store.token)
        XCTAssertEqual(viewModel.state, .signedOut)
    }
}
```

- [ ] **Step 2: Add auth view model**

Create `mobile/ios/App/App/Auth/AuthViewModel.swift`:

```swift
import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    enum State: Equatable {
        case checking
        case signedOut
        case signedIn(MobileUser)
    }

    @Published private(set) var state: State = .checking
    @Published var errorMessage: String?

    private let api: APIClient
    private let sessionStore: SessionStoring

    var token: String? { sessionStore.token }

    init(api: APIClient, sessionStore: SessionStoring) {
        self.api = api
        self.sessionStore = sessionStore
    }

    func restore() async {
        guard let token = sessionStore.token else {
            state = .signedOut
            return
        }

        do {
            let response: MeResponse = try await api.get(path: "/api/mobile/me", token: token)
            state = .signedIn(response.user)
        } catch {
            sessionStore.clear()
            state = .signedOut
        }
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        do {
            let response: LoginResponse = try await api.send(
                path: "/api/mobile/auth/login",
                method: "POST",
                body: LoginRequest(email: email, password: password)
            )
            sessionStore.save(token: response.token)
            state = .signedIn(response.user)
        } catch {
            errorMessage = "Sign in failed"
            state = .signedOut
        }
    }

    func signOut() async {
        if let token = sessionStore.token {
            struct Empty: Encodable {}
            let _: EmptyResponse? = try? await api.send(
                path: "/api/mobile/auth/logout",
                method: "POST",
                token: token,
                body: Empty()
            )
        }
        sessionStore.clear()
        state = .signedOut
    }
}

struct EmptyResponse: Codable, Equatable {}
```

- [ ] **Step 3: Add login view**

Create `mobile/ios/App/App/Auth/LoginView.swift`:

```swift
import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Spacer()
                Text("Pacific Drone")
                    .font(.largeTitle.bold())
                    .foregroundStyle(AppTheme.ink)
                Text("Sign in to continue your RPAS training.")
                    .foregroundStyle(AppTheme.secondaryInk)

                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)

                if let error = auth.errorMessage {
                    Text(error).foregroundStyle(.red)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(email.isEmpty || password.isEmpty)

                Link("Need an account or password reset?", destination: URL(string: "https://pacificdrone.ca/en/signin")!)
                    .font(.footnote)

                Spacer()
            }
            .padding(24)
            .background(AppTheme.paper)
        }
    }
}
```

- [ ] **Step 4: Add main tabs and initial screens**

Create `mobile/ios/App/App/MainTabView.swift`:

```swift
import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            LearnView()
                .tabItem { Label("Learn", systemImage: "book") }
            ExamView()
                .tabItem { Label("Exam", systemImage: "checkmark.circle") }
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(AppTheme.accent)
    }
}
```

Create `mobile/ios/App/App/Home/HomeView.swift`:

```swift
import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Continue Learning")
                        .font(.title2.bold())
                    Text("Your next lesson will appear here after dashboard loading is connected.")
                        .foregroundStyle(AppTheme.secondaryInk)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.accentSoft)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding()
            }
            .background(AppTheme.paper)
            .navigationTitle("Home")
        }
    }
}
```

Create `mobile/ios/App/App/Learn/LearnView.swift`:

```swift
import SwiftUI

struct LearnView: View {
    var body: some View {
        NavigationStack {
            Text("Courses")
                .navigationTitle("Learn")
        }
    }
}
```

Create `mobile/ios/App/App/Exam/ExamView.swift`:

```swift
import SwiftUI

struct ExamView: View {
    var body: some View {
        NavigationStack {
            Text("Mock Exams")
                .navigationTitle("Exam")
        }
    }
}
```

Create `mobile/ios/App/App/Account/AccountView.swift`:

```swift
import SwiftUI

struct AccountView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        NavigationStack {
            List {
                Button("Sign Out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            }
            .navigationTitle("Account")
        }
    }
}
```

- [ ] **Step 5: Wire files into Xcode and run tests**

Add the new Swift files to `mobile/ios/App/App.xcodeproj/project.pbxproj`, then run:

```bash
xcodebuild test -workspace mobile/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: PASS for auth and foundation tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add mobile/ios/App/App/Auth/AuthViewModel.swift mobile/ios/App/App/Auth/LoginView.swift mobile/ios/App/App/MainTabView.swift mobile/ios/App/App/Home/HomeView.swift mobile/ios/App/App/Learn/LearnView.swift mobile/ios/App/App/Exam/ExamView.swift mobile/ios/App/App/Account/AccountView.swift mobile/ios/App/AppTests/AuthViewModelTests.swift mobile/ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat(ios): add auth and tab shell"
```

## Task 9: iOS Dashboard, Lessons, And Exam Flow

**Files:**
- Create: `mobile/ios/App/App/Home/DashboardViewModel.swift`
- Modify: `mobile/ios/App/App/Home/HomeView.swift`
- Create: `mobile/ios/App/App/Learn/LearnModels.swift`
- Modify: `mobile/ios/App/App/Learn/LearnView.swift`
- Modify: `mobile/ios/App/App/Learn/LessonReaderView.swift`
- Create: `mobile/ios/App/App/Exam/ExamModels.swift`
- Modify: `mobile/ios/App/App/Exam/ExamView.swift`
- Create: `mobile/ios/App/AppTests/DashboardViewModelTests.swift`
- Create: `mobile/ios/App/AppTests/ExamViewModelTests.swift`
- Modify: `mobile/ios/App/App.xcodeproj/project.pbxproj`

- [ ] **Step 1: Add dashboard view model**

Create `mobile/ios/App/App/Home/DashboardViewModel.swift`:

```swift
import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    enum State: Equatable {
        case idle
        case loading
        case loaded(DashboardResponse)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func load(token: String) async {
        state = .loading
        do {
            let dashboard: DashboardResponse = try await api.get(path: "/api/mobile/dashboard?locale=en", token: token)
            state = .loaded(dashboard)
        } catch {
            state = .failed("Unable to load dashboard")
        }
    }
}
```

- [ ] **Step 2: Update HomeView to load dashboard**

Replace `mobile/ios/App/App/Home/HomeView.swift` with:

```swift
import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = DashboardViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch viewModel.state {
                    case .idle, .loading:
                        ProgressView().frame(maxWidth: .infinity)
                    case .failed(let message):
                        Text(message).foregroundStyle(.red)
                    case .loaded(let dashboard):
                        Text("Welcome back")
                            .font(.title2.bold())
                        if let resume = dashboard.resume {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Continue Learning")
                                    .font(.caption.bold())
                                    .foregroundStyle(AppTheme.accent)
                                Text(resume.title)
                                    .font(.headline)
                                Text("\(resume.courseTitle) · \(resume.pct)% complete")
                                    .foregroundStyle(AppTheme.secondaryInk)
                            }
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.accentSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        Text("Overall progress: \(dashboard.progress.overallPct)%")
                            .foregroundStyle(AppTheme.secondaryInk)
                    }
                }
                .padding()
            }
            .background(AppTheme.paper)
            .navigationTitle("Home")
            .task {
                if let token = auth.token {
                    await viewModel.load(token: token)
                }
            }
        }
    }
}
```

- [ ] **Step 3: Add learn models and native lesson reader**

Create `mobile/ios/App/App/Learn/LearnModels.swift`:

```swift
import Foundation

struct CoursesResponse: Codable, Equatable {
    let courses: [MobileCourse]
}

struct MobileCourse: Codable, Identifiable, Equatable {
    var id: String { course }
    let course: String
    let title: String
    let locked: Bool
    let done: Int
    let total: Int
    let modules: [MobileModule]
}

struct MobileModule: Codable, Identifiable, Equatable {
    var id: String { moduleId }
    let moduleId: String
    let lessons: [MobileLessonMeta]
}

struct MobileLessonMeta: Codable, Identifiable, Equatable {
    var id: String { lessonId }
    let lessonId: String
    let title: String
    let estMinutes: Int
    let completed: Bool
}

struct MobileLessonResponse: Codable, Equatable {
    let meta: MobileLessonMeta
    let completed: Bool
    let blocks: [MobileLessonBlock]
}

enum MobileLessonBlock: Codable, Equatable, Identifiable {
    var id: String { String(describing: self) }

    case heading(level: Int, text: String)
    case paragraph(text: String)
    case list(ordered: Bool, items: [String])
    case callout(tone: String, text: String)
}
```

Create `mobile/ios/App/App/Learn/LessonReaderView.swift`:

```swift
import SwiftUI

struct LessonReaderView: View {
    let lesson: MobileLessonResponse

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(lesson.meta.title)
                    .font(.title.bold())
                ForEach(lesson.blocks) { block in
                    switch block {
                    case .heading(let level, let text):
                        Text(text).font(level == 1 ? .title2.bold() : .headline)
                    case .paragraph(let text):
                        Text(text).foregroundStyle(AppTheme.secondaryInk)
                    case .list(_, let items):
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(items, id: \.self) { item in
                                Text("• \(item)")
                            }
                        }
                    case .callout(_, let text):
                        Text(text)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.accentSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.paper)
    }
}
```

- [ ] **Step 4: Add minimal exam models and flow**

Create `mobile/ios/App/App/Exam/ExamModels.swift`:

```swift
import Foundation

struct CreateExamRequest: Encodable {
    let certLevel: String
    let locale: String
}

struct CreatedExam: Codable, Equatable {
    let sessionId: String
    let expiresAt: Int
    let total: Int
}

struct PublicQuestion: Codable, Identifiable, Equatable {
    let id: String
    let stem: String
    let options: [PublicOption]
}

struct PublicOption: Codable, Identifiable, Equatable {
    let id: String
    let label: String
}
```

Replace `mobile/ios/App/App/Exam/ExamView.swift` with:

```swift
import SwiftUI

struct ExamView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var status = "Choose a mock exam"

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text(status)
                    .foregroundStyle(AppTheme.secondaryInk)

                Button("Start Basic Mock Exam") {
                    Task { await start(certLevel: "BASIC") }
                }
                .buttonStyle(.borderedProminent)

                Button("Start Advanced Mock Exam") {
                    Task { await start(certLevel: "ADVANCED") }
                }
                .buttonStyle(.bordered)
            }
            .padding()
            .navigationTitle("Exam")
        }
    }

    private func start(certLevel: String) async {
        guard let token = auth.token else { return }
        do {
            let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
            let created: CreatedExam = try await api.send(
                path: "/api/mobile/exam",
                method: "POST",
                token: token,
                body: CreateExamRequest(certLevel: certLevel, locale: "EN")
            )
            status = "Created exam with \(created.total) questions"
        } catch {
            status = "Unable to start exam"
        }
    }
}
```

- [ ] **Step 5: Wire files into Xcode and build**

Add the new Swift files to `mobile/ios/App/App.xcodeproj/project.pbxproj`, then run:

```bash
xcodebuild build -workspace mobile/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

Run:

```bash
git add mobile/ios/App/App/Home/DashboardViewModel.swift mobile/ios/App/App/Home/HomeView.swift mobile/ios/App/App/Learn/LearnModels.swift mobile/ios/App/App/Learn/LearnView.swift mobile/ios/App/App/Learn/LessonReaderView.swift mobile/ios/App/App/Exam/ExamModels.swift mobile/ios/App/App/Exam/ExamView.swift mobile/ios/App/AppTests/DashboardViewModelTests.swift mobile/ios/App/AppTests/ExamViewModelTests.swift mobile/ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat(ios): connect learning MVP screens"
```

## Task 10: End-To-End Verification And Cleanup

**Files:**
- Modify only files required by failing checks from prior tasks.
- Update `mobile/README.md` if the run instructions change for SwiftUI.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
pnpm test src/lib/mobile/session.test.ts app/api/mobile/auth/routes.test.ts src/lib/mobile/dashboard.test.ts src/lib/mobile/lessons.test.ts app/api/mobile/checkpoint/routes.test.ts app/api/mobile/exam/routes.test.ts
```

Expected: all targeted mobile tests PASS.

- [ ] **Step 2: Run full backend checks**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: both commands PASS. If either fails, fix only failures caused by the mobile MVP work.

- [ ] **Step 3: Build iOS app**

Run:

```bash
xcodebuild build -workspace mobile/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Manual smoke test**

Run the app in the simulator and verify:

```text
1. Launch app.
2. Sign in with an existing learner account.
3. Confirm Home loads dashboard data.
4. Confirm Account can sign out.
5. Sign in again.
6. Start a Basic mock exam from Exam.
7. Confirm Advanced mock exam shows an error for a free learner.
```

Expected: each step behaves as described.

- [ ] **Step 5: Update mobile README if needed**

If the iOS run flow changed from Capacitor commands to Xcode direct build, update `mobile/README.md` with:

```md
## Native iOS MVP

The iOS app now uses SwiftUI for the learning MVP. Open `mobile/ios/App/App.xcworkspace` in Xcode and run the `App` scheme on an iPhone simulator. The SwiftUI app calls `/api/mobile/*` endpoints on the configured production or staging host.
```

- [ ] **Step 6: Final commit**

Run:

```bash
git status --short
git add mobile/README.md
git commit -m "docs(mobile): update native ios run notes"
```

If `mobile/README.md` did not change, skip this commit and leave the previous task commits as the final implementation commits.

## Self-Review

Spec coverage:

- Native iOS SwiftUI app: Tasks 7-9.
- Email/password login and Keychain token: Tasks 1, 2, 7, 8.
- Learning dashboard: Tasks 3 and 9.
- Courses and lesson reader: Tasks 4 and 9.
- Lesson completion: Task 4.
- Mock exam create/answer/submit/review backend: Task 6.
- Mock exam iOS start flow: Task 9.
- Account sign-out: Task 8.
- Registration, purchase, OAuth, offline, push, Android excluded: Scope Notes and Task 8 web links.
- Verification: Task 10.

Placeholder scan:

- The plan contains no TBD, TODO, "implement later", or undefined task references.

Type consistency:

- Mobile account uses `userId`, `email`, `name`, and `accessTier` across session, auth, dashboard, and iOS models.
- Course values use `"basic" | "advanced"` in TypeScript service code and strings in Swift models.
- Exam values use `"BASIC" | "ADVANCED"` and `"EN" | "ZH"` across API and Swift request models.
