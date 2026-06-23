# 全项目 Code Review Report

**日期**：2026-06-19  
**范围**：`rpas-lms` 全项目复审，重点覆盖认证、权限、支付 webhook、数据库安全、限流/锁定、MFA、依赖、仓库卫生与测试状态。  
**审查方式**：源码阅读 + CodeGraph 定位 + git diff/status + 单测/构建/typecheck/audit + 静态安全扫描。

> 免责声明：本报告是 AI 辅助源码审查，不等同专业渗透测试。支付平台、Vercel、Stripe、Cloudflare、生产环境变量等外部状态未做线上验证。上线前建议再做一次真实环境 smoke test 和安全复核。

---

## 总体结论

这轮更新方向是正确的：SEC-10~17 的主体能力基本已落地，包括 DB-backed rate limit、登录锁定、管理员 TOTP MFA、弱密码拦截、后台路由 guard 测试、MDX allowlist 等。测试数量也从之前的 49/208 增到 55/234，说明安全补丁不是只写了代码。

当前主要风险不在“功能是否存在”，而在以下上线边界：

1. **关键新文件仍未被 git 跟踪**，直接提交会丢掉 rate-limit/MFA/迁移等核心实现。
2. **登录锁定和限流的计数不是原子操作**，高并发下可以绕过。
3. **Stripe webhook 仍存在先标记 processed、后发放权益的恢复语义 bug**。
4. **验证码消费/尝试次数仍是 check-then-update，存在并发绕过/重复消费风险**。
5. **依赖审计仍有 high/critical advisory**，其中 `next-intl` 是生产依赖。
6. **`.claude/settings.json` 和 `.codegraph/codegraph.db` 仍被跟踪**，仓库卫生和 agent 权限边界需要处理。

---

## 必须先处理的问题

### P1-1：关键新文件未跟踪，提交会丢功能

**证据**

当前这些文件处于 `??` 状态：

- `app/api/coriander/guards.test.ts`
- `app/api/coriander/mfa/route.ts`
- `app/coriander/security/MfaManager.tsx`
- `app/coriander/security/page.tsx`
- `prisma/migrations/20260618093000_add_rate_limit/migration.sql`
- `prisma/migrations/20260618093500_add_admin_totp/migration.sql`
- `src/lib/auth/adminMfa.ts`
- `src/lib/auth/adminMfa.test.ts`
- `src/lib/auth/loginLockout.test.ts`
- `src/lib/auth/totp.ts`
- `src/lib/auth/totp.test.ts`
- `src/lib/auth/weakPassword.ts`
- `src/lib/auth/weakPassword.test.ts`
- `src/lib/security/rateLimit.ts`
- `src/lib/security/rateLimit.test.ts`

**影响**

如果只提交 tracked diff：

- `prisma/schema.prisma` 会引用 `RateLimit` 和 admin TOTP 字段；
- `auth.ts` / routes 会引用新模块；
- 但实现、测试和迁移不会进入仓库；
- CI 或部署会直接失败，或者生产库缺表/缺列。

**建议**

提交前必须把这些文件纳入 git，尤其是两个 migration 和 `src/lib/security/rateLimit.ts`。

---

### P1-2：DB rate limit / lockout 不是原子计数

**位置**

- `src/lib/security/rateLimit.ts:36`
- `src/lib/security/rateLimit.ts:54-57`

**问题**

当前逻辑是：

1. `findUnique` 读取 row；
2. `const count = row.count + 1`;
3. `update` 写回 count。

多个并发请求可能同时读到相同 count，然后都写回同一个新值。普通接口限流会变松；放在登录/管理员登录边界上，会削弱 brute-force 防护。

**影响**

- 登录失败次数可能被低估；
- 管理员登录锁定可被并发绕过；
- 注册/忘记密码/checkout 限流在高并发攻击下不可靠。

**建议**

改成数据库原子操作：

- 使用 Prisma `increment`，并用事务保证窗口判断；
- 或 Postgres raw SQL `INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1 ... RETURNING`;
- 对 lock/window reset 分支要保证同一 key 的并发串行化；
- 增加并发测试，例如 20 个 Promise 同时 hit，最终 count 应准确，超过阈值必须被拒。

---

### P1-3：Stripe webhook 先记录 processed，后发放权益

**位置**

- `app/api/payments/webhook/route.ts:45-49`
- `app/api/payments/webhook/route.ts:74-77`

**问题**

当前流程：

1. 创建 `WebhookEvent`；
2. 如果 event id 重复，直接返回 200；
3. 然后才根据 product 调用 `grantPaidAccessFromCheckout` 或 `grantFlightReviewFromCheckout`。

如果第 1 步成功，但第 3 步失败，Stripe 重试时会因为 `WebhookEvent` 已存在而直接 200。结果是：用户已付款，但权益没有发放。

**影响**

这是支付闭环里的高风险恢复语义 bug。任何 DB 临时错误、代码异常、约束错误都可能导致“付款成功但不解锁”，且自动重试无法修复。

**建议**

任选其一：

- 将 `WebhookEvent`、`Payment`、`Entitlement` 更新放进同一个事务，只有权益发放成功才记录 processed；
- 或给 `WebhookEvent` 增加 `status: processing | succeeded | failed`，重复 event 只有 `succeeded` 才吞掉，`failed` 允许重试；
- 补测试：模拟 grant 抛错后，第二次 webhook 应继续尝试 grant，而不是直接 200。

---

### P1-4：验证码验证和消费不是原子操作

**位置**

- `src/lib/auth/verificationCode.ts:82`
- `src/lib/auth/verificationCode.ts:99-117`

**问题**

当前逻辑先 `findFirst`，再：

- 错误验证码：`attempts = row.attempts + 1` 后 update；
- 正确验证码：直接 update `consumedAt`。

并发下存在两个问题：

- 多个错误尝试同时读到相同 attempts，导致失败次数低估；
- 多个正确请求同时通过 bcrypt compare，然后都可能认为验证成功。

**影响**

- 验证码 5 次尝试限制可被并发放大；
- reset token / email verification token 理论上可被并发重复消费。

**建议**

- 错误路径用 `updateMany` + `increment`，where 包含 `id`、`consumedAt:null`、`attempts < MAX_ATTEMPTS`、`expiresAt > now`；
- 成功路径用条件 update：`where id + consumedAt:null + expiresAt>now + attempts<MAX`，检查 affected count；
- 补并发测试。

---

### P1-5：`.claude/settings.json` 被跟踪且权限过宽

**位置**

- `.claude/settings.json`

**问题**

该文件包含大量 agent tool allowlist，包括：

- `git reset *`
- `sudo mv`
- 直接 `sqlite3 UPDATE`
- `npm i *`
- `gh api *`
- 多个机器本地路径和临时文件路径

**影响**

这不是应用运行时漏洞，但属于仓库安全边界问题。把个人 agent 权限、机器路径、宽泛命令权限提交到项目里，会让后续协作和自动化工具更难控。

**建议**

- 从 git 中移除 `.claude/settings.json`；
- 加入 `.gitignore`；
- 如果需要共享，保留 `.claude/settings.example.json`，只放最小必要权限；
- 同时移除 `.codegraph/codegraph.db`，`.codegraph/.gitignore` 已说明只应保留 `.gitignore`。

---

## 应尽快处理的问题

### P2-1：`userNumber = max + 1` 并发创建仍有冲突

**位置**

- `src/lib/auth/localAccount.ts:154-162`
- `prisma/schema.prisma:34`

**问题**

注册时先查 `_max.userNumber`，再 `+1` 创建。两个并发注册会得到同一个编号，其中一个触发唯一约束失败。

**建议**

- 使用 Postgres sequence / autoincrement；
- 或捕获 `P2002` 后有限重试；
- 如果 `userNumber` 不是强需求，可以延后生成或改为非业务关键字段。

---

### P2-2：管理员 MFA 启用缺少 step-up reauth

**位置**

- `app/api/coriander/mfa/route.ts:34-42`
- `src/lib/auth/adminMfa.ts:18-31`

**问题**

`begin` / `confirm` 只需要当前 admin session。若 admin session 被盗，攻击者可以绑定自己的 TOTP，形成持久锁定或账号接管。

**建议**

- `begin` 或 `confirm` 要求当前密码；
- 或要求最近一次 reauth 时间；
- 更理想：敏感操作统一 step-up auth，包括启用/禁用 MFA、改密码、管理员权限操作。

---

### P2-3：依赖审计仍有 high / critical

**结果**

`pnpm audit`：10 vulnerabilities

- 1 critical：`vitest < 3.2.6`
- 1 high：`vite <= 6.4.2`
- 7 moderate
- 1 low

**直接依赖**

- `vitest@2.1.9`：devDependency，critical advisory 来自 Vitest UI server；
- `next-intl@3.26.5`：production dependency，有 open redirect / prototype pollution advisories；
- `gray-matter@4.0.3`：production dependency，带 `js-yaml` advisory。

**建议**

优先级：

1. 规划 `next-intl` 升级，因为它在生产 middleware/i18n 路径上；
2. 升级 `vitest` 到 patched 版本，降低 dev server 风险；
3. 检查 `gray-matter` 是否仍必须作为生产 dependency，能否升级或移到更小使用面。

---

### P2-4：`pnpm typecheck` 依赖 `.next/types` 已生成

**位置**

- `tsconfig.json:44`

**现象**

在 clean `.next` 状态下先跑 `pnpm typecheck` 会失败，提示 `.next/types/...` 文件不存在。跑完 `pnpm build` 后再跑 `pnpm typecheck` 通过。

**影响**

CI 如果顺序是 `typecheck -> build` 会失败。

**建议**

- CI 顺序改为 `next build` 包含类型检查；
- 或调整 `typecheck` script 先生成 Next 类型；
- 或谨慎处理 `.next/types/**/*.ts` include。

---

## 文档和维护性问题

### P3-1：Launch checklist 已陈旧

**位置**

- `LAUNCH_CHECKLIST.md:67`
- `LAUNCH_CHECKLIST.md:71`

**问题**

文档仍说：

- 注册、code request、checkout 没有限流；
- webhook idempotency 已完成。

但当前代码里：

- `/api/auth/code/*` 已退休为 410；
- 注册、忘记密码、checkout 已有限流；
- webhook idempotency 有 event dedupe，但恢复语义仍不安全。

**建议**

更新 checklist，避免以后误判上线状态。

---

### P3-2：密码策略注释与实现漂移

**位置**

- `src/lib/auth/passwordPolicy.ts:3-5`

**问题**

注释仍说服务端只做长度校验，但 `registerLocalAccount` 已加入弱密码拦截。

**建议**

同步注释，说明：

- client complexity 是 UX gate；
- server 强制长度 + weak-password screen；
- reset/change password 当前是否需要同样 weak screen 需要产品决策。

---

## 正向发现

以下部分状态较好：

- Admin 和 Customer 物理分表，没有 role 字段共享。
- `adminGuard` 会同时检查 session hint 和 Admin 表，DB 是最终权限来源。
- `/api/auth/code/request` 和 `/api/auth/code/verify` 已退休为 410。
- 后台 coriander API 新增了覆盖 19 个 handler 的非管理员 guard 测试。
- Stripe webhook 和 Cloudflare Stream webhook 都有签名验证。
- MDX 校验由危险标签 blacklist 转为 allowlist。
- `.env` 未被 git 跟踪，`.gitignore` 已忽略 `.env` / `.env.*`，只保留 `.env.example`。
- 静态扫描未发现生产代码中的 raw SQL、shell exec/eval、TLS verify disabled、`dangerouslySetInnerHTML`。

---

## 本次验证结果

### 通过

- `pnpm test`
  - 55 test files passed
  - 234 tests passed
- `pnpm build`
  - Next.js production build passed
- `pnpm typecheck`
  - 首次失败见下方说明
  - `pnpm build` 生成 `.next/types` 后重跑通过
- `git diff --check`
  - passed

### 失败 / 警告

- `pnpm typecheck` 首次失败：
  - 原因是 `.next/types/**/*.ts` 被 tsconfig include，但 clean 状态下文件不存在。
- `pnpm audit --audit-level high`
  - failed
  - 1 critical, 1 high
- `pnpm audit`
  - failed
  - 10 vulnerabilities total

---

## 建议修复顺序

1. 先处理 git 跟踪状态：把核心 untracked 文件纳入提交，移除 `.claude/settings.json` / `.codegraph/codegraph.db`。
2. 修 `rateLimit.ts` 原子计数，并补并发测试。
3. 修 Stripe webhook 事务/状态机，确保失败可重试。
4. 修 `verificationCode.ts` 原子消费和 attempts increment。
5. 修 `userNumber` 并发分配。
6. 给 admin MFA begin/confirm 加 step-up password 或 recent reauth。
7. 升级/处理 `next-intl`、Vitest/Vite、gray-matter/js-yaml advisories。
8. 更新 `LAUNCH_CHECKLIST.md` 和密码策略注释。

---

## 上线前人工检查

- 确认生产库已应用：
  - `20260618093000_add_rate_limit`
  - `20260618093500_add_admin_totp`
- 确认 Vercel / 部署环境：
  - `NODE_ENV=production`
  - 没有 `ALLOW_TEST_AUTH=1`
  - `AUTH_SECRET` 足够强且非测试值
  - Stripe live keys 和 webhook secret 正确
  - Cloudflare Stream webhook secret 正确
- Stripe 真实 test-mode smoke：
  - checkout opens
  - webhook fires
  - Payment row created
  - Entitlement row created
  - session refresh shows paid access
- 管理员进入 `/coriander/security` 手动启用 MFA。

