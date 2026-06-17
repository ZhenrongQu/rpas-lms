# Monitoring (Sentry + Cloudflare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error monitoring (Sentry) so server/client errors are captured with readable stacks + email alerts, and document how to read existing Cloudflare traffic/security analytics.

**Architecture:** Wire `@sentry/nextjs` into the existing Next 15.5 App Router app via the modern instrumentation files (server/edge/client init + `instrumentation.ts` `onRequestError` + `app/global-error.tsx`), composing `withSentryConfig` around the existing `withNextIntl` wrapper. No custom request log, no Session Replay, no Vercel log drains. Cloudflare needs zero code — it already records every request; we deliver a `docs/MONITORING.md` guide and best-effort free alert setup via the existing `CLOUDFLARE_API_TOKEN`.

**Tech Stack:** Next.js 15.5 (App Router), `@sentry/nextjs`, next-intl, Vercel (Hobby), Cloudflare (Free), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-16-request-logging-monitoring-design.md`

---

## ⚠️ Read before executing

**Testing approach (deliberate deviation from default TDD):** This work is integration/config wiring + a docs file. There is no meaningful pure logic to unit-test, and asserting "`Sentry.init` was called" would be brittle, low-value, and violates the project's `CLAUDE.md` ("Simplicity First — no tests for impossible scenarios"). Per the superpowers instruction-priority rule, the user's `CLAUDE.md` outranks the skill's TDD default. **Verification here = `pnpm typecheck` + `pnpm build` + a one-time manual "trigger an error, see it in Sentry" check + keeping the existing `pnpm test` suite green.** No new vitest files.

**Blocking dependency:** Tasks needing the Sentry DSN/token are marked **[NEEDS DSN]**. They depend on **Task 0** (user creates the Sentry account). Everything else (code + the Cloudflare doc) can be done now.

- Do now, no DSN: Tasks 1, 2, 3, 4, 5, 6, 7, 10, 11
- Need DSN (Task 0 first): Tasks 8, 9

**Commits:** per-task commits below follow the project flow. **Pushing the branch / opening the PR happens only on explicit user request** (per `CLAUDE.md`). Branch is already `feat/monitoring-sentry`.

**Env-value placeholders:** where a step shows `<DSN>`, `<AUTH_TOKEN>`, `<ORG>`, `<PROJECT>`, substitute the real values the user provides in Task 0. These are runtime secrets, not plan gaps.

---

## Task 0: [USER, BLOCKING] Create Sentry project & collect credentials

**Owner:** user (AI guides). Nothing to commit.

- [ ] **Step 1: Create account + project**

User: sign up at https://sentry.io (free "Developer" tier) → **Create Project** → Platform = **Next.js** → name e.g. `pacificdrone`.

- [ ] **Step 2: Copy the DSN**

From the project's onboarding screen (or Settings → Client Keys (DSN)). Looks like `https://abc123@o12345.ingest.us.sentry.io/678910`. → this is `NEXT_PUBLIC_SENTRY_DSN`.

- [ ] **Step 3: (Recommended) Create an auth token for source maps**

Settings → Auth Tokens → **Create New Token** with scopes `project:releases` + `org:read` (the "Source Maps" preset). → this is `SENTRY_AUTH_TOKEN`. Also note the **org slug** (`SENTRY_ORG`) and **project slug** (`SENTRY_PROJECT`) from the URL `sentry.io/organizations/<ORG>/projects/<PROJECT>/`.

- [ ] **Step 4: Hand the 4 values to the AI** (or set them in Vercel directly): `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

> Without `SENTRY_AUTH_TOKEN` everything still works, but production stack traces stay minified (hard to read). Strongly recommended.

---

## Task 1: Install the Sentry SDK

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @sentry/nextjs`

- [ ] **Step 2: Confirm the version supports client instrumentation**

Run: `node -e "console.log(require('@sentry/nextjs/package.json').version)"`
Expected: `9.x` or `10.x` (any ≥ 9 supports `instrumentation-client.ts` + `captureRouterTransitionStart`, which Next 15.5 requires). If it prints `< 9`, run `pnpm add @sentry/nextjs@latest`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(monitoring): add @sentry/nextjs dependency"
```

---

## Task 2: Server + Edge Sentry init configs

**Files:**
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`

- [ ] **Step 1: Create `sentry.server.config.ts`**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only send in deployed (production-build) environments. Local `next dev`
  // (NODE_ENV=development) stays silent; a missing DSN also no-ops.
  enabled: process.env.NODE_ENV === 'production',
  // Low perf sampling to stay inside the free quota; errors are always 100%.
  tracesSampleRate: 0.1,
  // Privacy: do not attach IP / cookies / request bodies by default.
  sendDefaultPii: false,
});
```

- [ ] **Step 2: Create `sentry.edge.config.ts`** (same options; runs in the Edge runtime, e.g. middleware)

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add sentry.server.config.ts sentry.edge.config.ts
git commit -m "feat(monitoring): add Sentry server + edge init configs"
```

---

## Task 3: Client Sentry init config

**Files:**
- Create: `instrumentation-client.ts` (Next 15.3+ replacement for `sentry.client.config.ts`; runs in the browser)

- [ ] **Step 1: Create `instrumentation-client.ts`**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // No Session Replay (privacy + quota): replay integration intentionally omitted.
});

// Lets Sentry trace App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add instrumentation-client.ts
git commit -m "feat(monitoring): add Sentry client init config"
```

---

## Task 4: Register instrumentation + server request-error hook

**Files:**
- Create: `instrumentation.ts`

- [ ] **Step 1: Create `instrumentation.ts`**

```ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown in Server Components, route handlers, etc.
// This is the hook that would have caught the 2026-06-16 dashboard 500.
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add instrumentation.ts
git commit -m "feat(monitoring): register Sentry instrumentation + onRequestError"
```

---

## Task 5: Global error boundary

**Files:**
- Create: `app/global-error.tsx`

**Why:** App Router renders `global-error.tsx` when the root layout itself throws. It must be a Client Component, renders its own `<html>/<body>` (it replaces the root layout, so next-intl context is NOT available here — keep copy static/neutral, no `useTranslations`).

- [ ] **Step 1: Create `app/global-error.tsx`**

```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#666' }}>出错了，请稍后重试。</p>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/global-error.tsx
git commit -m "feat(monitoring): add global-error boundary that reports to Sentry"
```

---

## Task 6: Wrap `next.config.ts` with `withSentryConfig`

**Files:**
- Modify: `next.config.ts` (currently 8 lines: `export default withNextIntl(nextConfig);`)

- [ ] **Step 1: Replace the file contents**

```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet locally, verbose in CI/Vercel build logs.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for better stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry's internal logger from the client bundle.
  disableLogger: true,
  // tunnelRoute intentionally NOT set: a tunnel path (e.g. /monitoring) would be
  // caught by the next-intl middleware matcher and redirected to /en/monitoring,
  // breaking it. See spec "已知交互".
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Build (integration check)**

Run: `pnpm build`
Expected: build succeeds. Sentry may log `warning: No auth token provided ... skipping sourcemap upload` (fine — token lives on Vercel, Task 8). If the build needs DB/env that's unrelated to Sentry, confirm `git stash` of these changes builds the same way (i.e., Sentry isn't the cause of any failure).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(monitoring): wrap next config with withSentryConfig"
```

---

## Task 7: Ignore Sentry build artifacts + document env vars

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Append to `.gitignore`**

```gitignore

# Sentry
.sentryclirc
.env.sentry-build-plugin
```

- [ ] **Step 2: Append to `.env.example`**

```dotenv

# --- Sentry error monitoring ---
# DSN is public (safe to expose to the browser).
NEXT_PUBLIC_SENTRY_DSN=
# The three below are build-time only (source map upload). AUTH_TOKEN is secret.
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore(monitoring): ignore Sentry artifacts + document env vars"
```

---

## Task 8: [NEEDS DSN] Wire env vars (local + Vercel)

**Files:**
- Modify: `.env` (local, gitignored — never commit)

**Depends on:** Task 0 values. Uses `VERCEL_TOKEN` from `.env` (see `project_launch_status` memory: scope `rpas-lms-projects`).

- [ ] **Step 1: Add the DSN to local `.env`**

Append to `.env` (so local `pnpm build && pnpm start` can be used to verify in Task 9):

```dotenv
NEXT_PUBLIC_SENTRY_DSN=<DSN>
```

(Local does not need ORG/PROJECT/AUTH_TOKEN unless you build with source-map upload locally.)

- [ ] **Step 2: Set the 4 vars on Vercel Production**

Run (substitute real values; pipe each value via stdin):

```bash
echo -n "<DSN>"        | npx vercel env add NEXT_PUBLIC_SENTRY_DSN production --token "$VERCEL_TOKEN" --scope rpas-lms-projects
echo -n "<ORG>"        | npx vercel env add SENTRY_ORG           production --token "$VERCEL_TOKEN" --scope rpas-lms-projects
echo -n "<PROJECT>"    | npx vercel env add SENTRY_PROJECT       production --token "$VERCEL_TOKEN" --scope rpas-lms-projects
echo -n "<AUTH_TOKEN>" | npx vercel env add SENTRY_AUTH_TOKEN    production --token "$VERCEL_TOKEN" --scope rpas-lms-projects
```

- [ ] **Step 3: (Optional) Mirror the DSN to Preview** (so `dev.pacificdrone.ca` also reports errors). Per `project_launch_status` memory, Preview env adds require an existing remote branch + explicit branch arg:

```bash
echo -n "<DSN>" | npx vercel env add NEXT_PUBLIC_SENTRY_DSN preview dev --token "$VERCEL_TOKEN" --scope rpas-lms-projects
```

- [ ] **Step 4: Verify the vars are set**

Run: `npx vercel env ls --token "$VERCEL_TOKEN" --scope rpas-lms-projects`
Expected: the new names appear (values are masked — confirm by name only; do not print values).

> No commit — `.env` is gitignored, Vercel state is remote.

---

## Task 9: [NEEDS DSN] Verify capture end-to-end, then remove the probe

**Files:**
- Create then DELETE: `app/api/_sentry-check/route.ts` (temporary probe — never committed)

- [ ] **Step 1: Create the temporary probe**

```ts
export const dynamic = 'force-dynamic';

export function GET() {
  throw new Error('Sentry server check — safe to ignore');
}
```

- [ ] **Step 2: Build & start in production mode locally** (so `enabled` is true and the DSN from Task 8 is used)

Run: `pnpm build && pnpm start`
Expected: server starts on http://localhost:3000.

- [ ] **Step 3: Trigger the error**

Run (in another shell): `curl -i http://localhost:3000/api/_sentry-check`
Expected: HTTP 500. (`/api/*` is excluded from middleware, so no i18n redirect interferes.)

- [ ] **Step 4: Confirm in Sentry**

In the Sentry dashboard (Issues), within ~1 min: a new issue `Sentry server check — safe to ignore` appears, and an alert email arrives. If `SENTRY_AUTH_TOKEN` was set on the build, the stack is readable (un-minified).

- [ ] **Step 5: Stop the server and DELETE the probe**

Stop `pnpm start` (Ctrl-C). Then:

```bash
rm app/api/_sentry-check/route.ts
git status --short   # expected: nothing about _sentry-check (it was never committed)
```

> Nothing to commit for this task — the probe is ephemeral.

---

## Task 10: Cloudflare monitoring guide

**Files:**
- Create: `docs/MONITORING.md`

- [ ] **Step 1: Create `docs/MONITORING.md`**

````markdown
# 监控与日志 — 怎么看

本项目的可观测性分两块:**报错 → Sentry**(自动上报,出错有邮件);**流量 + 安全 → Cloudflare**(本来就在记,这里教你在哪看)。设计见 `docs/superpowers/specs/2026-06-16-request-logging-monitoring-design.md`。

## 一、报错(Sentry)

- 后台:https://sentry.io → 你的项目 → **Issues**。每个错误一条,点进去看堆栈(哪一行/什么原因)、发生次数、影响用户、所在环境(production / preview)。
- 邮件提醒:Sentry 默认对"新错误"发邮件。调整在 **Settings → Alerts**。
- 环境变量(已配在 Vercel):`NEXT_PUBLIC_SENTRY_DSN`(上报地址)、`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`(构建时上传 source map,使堆栈可读)。本地 `.env` 只放 DSN。
- 隐私:已设 `sendDefaultPii: false`、未启用 Session Replay。**发布前**把 Sentry 写进隐私政策的"数据处理方"。

## 二、流量 + 安全(Cloudflare)

Cloudflare 挡在 `pacificdrone.ca` 最前面,每条请求都过它,所以无需写代码。

**看流量**:Cloudflare Dashboard → 选 zone `pacificdrone.ca` → **Analytics & Logs → Traffic**
- 请求数、独立访客、带宽、状态码分布(2xx/4xx/5xx)、Top 路径、来源国家、设备。
- 免费档数据保留期有限(约 24–72 小时的明细 + 更长的聚合);要长期错误历史看 Sentry。

**看安全**:**Security → Events**(WAF / 防火墙拦截记录,`RPASApp` App 允许规则也在这)、**Security → Analytics**。

**告警(Notifications)**:Dashboard → **Notifications → Add**。
- 免费档可开的(按你账号实际可选为准):SSL/TLS 证书到期、账号安全、部分 L7 DDoS 攻击告警。
- "错误率飙升 / 流量异常"等精细告警多为 Pro+,作为以后升级项。

## 三、本期不做(未来可选)

自建请求明细账本(每条请求入库 + 后台日志页)、Session Replay 录屏、Vercel 日志导出(需 Pro)、Cloudflare Web Analytics beacon、Cloudflare 精细告警(需 Pro)。
````

- [ ] **Step 2: Commit**

```bash
git add docs/MONITORING.md
git commit -m "docs(monitoring): how to read Sentry + Cloudflare"
```

---

## Task 11: [Best-effort] Auto-create available Cloudflare alerts

**Files:**
- Modify: `docs/MONITORING.md` (record the outcome)

Uses `CLOUDFLARE_API_TOKEN` from `.env`. CF zone id is `b1c2426b28bc7877e427bba8ef8f42d0`; account id is needed for alert policies (discover it below). Free-tier alert availability is limited and token-scope dependent — this task **discovers then creates what's possible**, and documents the rest as manual UI steps. Do not treat partial success as failure.

- [ ] **Step 1: Discover account id + available alert types**

```bash
# Pretty-print with jq if present, else python3, else raw.
fmt() { jq . 2>/dev/null || python3 -m json.tool 2>/dev/null || cat; }
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts" | fmt
# note the account "id", then:
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/alerting/v3/available_alerts" | fmt
```
Expected: JSON listing alert types available to this account/plan. If the token lacks `Notifications` scope, you'll get an auth error — then skip to Step 4 (document manual steps).

- [ ] **Step 2: Ensure an email destination exists**

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/alerting/v3/destinations/eligible"
```
The account owner email (robbieqzr@gmail.com) is typically already eligible.

- [ ] **Step 3: Create a free-tier alert policy (if available from Step 1)**

Example — SSL/TLS certificate expiry (commonly free). Only run for alert types that Step 1 confirmed available:

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/alerting/v3/policies" \
  --data '{
    "name": "Pacific Drone — alert",
    "alert_type": "<ALERT_TYPE_FROM_STEP_1>",
    "enabled": true,
    "mechanisms": { "email": [{ "id": "robbieqzr@gmail.com" }] }
  }'
```
Expected: `"success": true`. Repeat for each available free alert that makes sense.

- [ ] **Step 4: Record outcome in `docs/MONITORING.md`**

Under "告警", replace the generic note with the concrete result: which alerts were auto-created, and exact UI click-path for any that must be done manually (Notifications → Add → pick type → set email → Save).

- [ ] **Step 5: Commit**

```bash
git add docs/MONITORING.md
git commit -m "docs(monitoring): record Cloudflare alert setup"
```

---

## Task 12: Final verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Tests (regression guard)**

Requires the test Postgres (per project `CLAUDE.md`): `docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16` (if not already running).
Run: `pnpm test`
Expected: PASS — Sentry changes touch no tested code, so the suite is unchanged.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS (Sentry source-map upload may run if local env has the token; otherwise a skip warning).

- [ ] **Step 4: Confirm working tree is clean of stray files**

Run: `git status --short`
Expected: no `_sentry-check`, no `.env` staged, no unintended files.

- [ ] **Step 5: [USER GO-AHEAD REQUIRED] Push + open PR**

Per `CLAUDE.md`, push only when the user asks. When they do:

```bash
git push -u origin feat/monitoring-sentry
gh pr create --base main --head feat/monitoring-sentry \
  --title "feat(monitoring): Sentry error tracking + Cloudflare monitoring guide" \
  --body "$(cat <<'EOF'
## What
- Wire @sentry/nextjs (server/edge/client init, onRequestError, global-error boundary, withSentryConfig).
- docs/MONITORING.md: how to read Sentry + Cloudflare traffic/security; Cloudflare free alerts.

## Not included (per spec)
Self-built request ledger, Session Replay, Vercel log drains.

## Verification
typecheck + build green; existing tests green; live error captured in Sentry with email alert.

Spec: docs/superpowers/specs/2026-06-16-request-logging-monitoring-design.md
Plan: docs/superpowers/plans/2026-06-16-monitoring-sentry-cloudflare.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Sentry deps | 1 |
| 4 init files (server/edge/client/instrumentation) | 2, 3, 4 |
| global-error.tsx | 5 |
| Wrap next.config (compose with next-intl) | 6 |
| Privacy config (no PII, no Replay), low sampling | 2, 3 |
| `.gitignore` + `.env.example` | 7 |
| Env to Vercel Production (+ optional Preview) + local | 8 |
| Verify capture + readable stack + email, then remove probe | 9 |
| `docs/MONITORING.md` (Cloudflare where-to-look) | 10 |
| Best-effort CF free alerts via API | 11 |
| tunnelRoute NOT enabled (middleware collision) | 6 |
| typecheck/build/test green | 12 |
| Privacy policy mention of Sentry/Cloudflare | 10 (documented; user action at launch) |

No gaps.
