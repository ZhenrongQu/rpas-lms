# 网站日志 / 监控功能 — 设计文档（v1）

> 状态：**已批准设计（2026-06-16）**，待写实施计划。
> 一句话：从"出事看不到"变成"出事自动知道、能看清"。

## 背景（为什么做）

2026-06-16 生产环境出过一次 `Application error ... Digest: 2874868107`（500），错误页只让用户"去看服务器日志"，但当时**网站没有任何日志/监控系统**，只能在 Vercel / Cloudflare 后台一层层翻，排查很被动。本功能就是补上这块可观测性。

现状盘点（2026-06-16）：
- `package.json` 无任何监控/日志依赖（无 Sentry、无 analytics）。
- `src/` 无 logger 工具；`app/api` 里基本没有 `console.*`。
- `middleware.ts` 只做 i18n + admin 绕过，且 matcher **排除了 `/api`**。
- 托管：Vercel（**Hobby 套餐**，不打算升级）+ Cloudflare（代理 + WAF，已在用）+ Supabase（Postgres）。

## 目标 / 非目标

**目标（用户确认"以上都要"，按最省力方式拆解）：**
1. **排查报错** — 出错自动记录"哪一行、为什么、谁触发"，并邮件提醒。
2. **看访客流量** — 多少人、看了哪些页、来自哪里。
3. **安全监控** — 攻击 / 可疑请求记录。

**非目标（v1 明确不做）：**
- **自建"请求明细账本"**（每条请求写进自己的 DB + 后台日志页）——用户选了"先不做"。以后想要再单独立项。
- Session Replay（录屏）—— 隐私敏感，关闭。
- Vercel 日志导出（log drain）—— 需 Vercel Pro，不做。
- 第三方流量分析 SaaS（GA / Plausible 等）—— Cloudflare 已覆盖流量，不引入。

## 关键决策

- **路线 = 混合方案（方案 A）**：报错用免费 Sentry（要写代码）；流量 + 安全用**已有的 Cloudflare**（基本零代码，主要是"教你在哪看 + 打开告警"）。
- **新增成本 = $0**：Sentry 免费 Developer 档（约 5k 错误/月、1 用户）+ Cloudflare 免费档 + Vercel 不升级。
- **不动 `middleware.ts` 的 matcher**（避免牵连 i18n / admin 行为）。
- **不启用 Sentry tunnelRoute**（见"已知交互"——会和 i18n 中间件冲突）。

---

## 第一块：Sentry 报错监控（需要写代码，AI 实施）

### 做什么
服务端错误（RSC / route handler / 那个 500）、客户端页面崩溃、接口异常 —— 自动上报到 Sentry，带**可读堆栈**（哪一行、什么原因）、请求上下文、并按 Sentry 规则**邮件提醒**。

### 技术方案（Next 15.5 App Router + `@sentry/nextjs`）
当前环境：`next ^15.5.19`，`next.config.ts` 已被 next-intl 包裹（`withNextIntl(nextConfig)`）；无 `instrumentation*.ts`、无 `app/global-error.tsx`。采用 SDK 现代初始化方式（Next 15.3+ 支持 `instrumentation-client.ts`）：

**新增文件：**
- `sentry.server.config.ts` — Node 运行时 `Sentry.init`。
- `sentry.edge.config.ts` — Edge 运行时 `Sentry.init`（中间件等）。
- `instrumentation-client.ts` — 浏览器端 `Sentry.init`；导出 `onRouterTransitionStart = Sentry.captureRouterTransitionStart`（捕捉 App Router 路由切换）。
- `instrumentation.ts` — `register()` 按 `process.env.NEXT_RUNTIME` 动态 import 上面 server / edge 配置；导出 `onRequestError = Sentry.captureRequestError`（捕捉 Next 15 的服务端请求错误，含 RSC）。
- `app/global-error.tsx` — `'use client'`，`useEffect` 里 `Sentry.captureException(error)` 兜住根级渲染崩溃，并显示一个极简的中性错误页（**不接 next-intl**：global-error 渲染在 locale provider 之外，用最简双语/英文文案即可）。

**修改文件：**
- `next.config.ts` — 外层包一层 `withSentryConfig`，即 `withSentryConfig(withNextIntl(nextConfig), sentryBuildOptions)`。
- `package.json` / lockfile — 加 `@sentry/nextjs`。
- `.env` + `.env.example` — 加 Sentry 变量（见下）。
- `.gitignore` — 忽略 Sentry 构建产物 / `.sentryclirc`（防止 auth token 误提交）。

### 配置取向（省额度 + 隐私友好）
- `tracesSampleRate`: **0.1**（性能追踪低采样，主要省免费额度；也可设 0 完全关性能、只留错误）。
- `sendDefaultPii`: **false**（不默认上报 IP / cookie / 请求体等个人信息）。
- **不加 Replay 集成**（`replaysSessionSampleRate` / `replaysOnErrorSampleRate` 不启用）。
- 仅在 DSN 存在时真正上报；本地 dev 默认不发（避免噪声）。生产必开，Preview 可选。
- `withSentryConfig` 选项：`org` / `project` / `authToken`（来自 env，用于上传 source map）、`silent: !process.env.CI`、`widenClientFileUpload: true`、`disableLogger: true`、**`tunnelRoute` 不设**。

### 环境变量（DSN 不是密钥，auth token 是）
| 变量 | 用途 | 放哪 |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | 上报地址（client + server 都用） | Vercel Production（+ 可选 Preview）+ 本地 `.env` |
| `SENTRY_ORG` | source map 上传 | Vercel（build 时）+ 本地 |
| `SENTRY_PROJECT` | source map 上传 | Vercel（build 时）+ 本地 |
| `SENTRY_AUTH_TOKEN` | **构建时**上传 source map（**密钥，勿提交**） | Vercel Production（+ 本地 build） |

> 不配 `SENTRY_AUTH_TOKEN` 也能用，但**生产堆栈会是压缩后的、不可读**。强烈建议配，否则"看清出错在哪一行"打折扣。

### 告警
Sentry 默认对"新错误"发邮件，在 Sentry 后台 Alerts 里确认 / 调整（属于账号设置，非代码）。

### 验证
- 临时加一个会抛错的测试入口（如 `/api/_sentry-test` 抛异常，或用 Sentry 自带测试按钮）→ 确认一分钟内出现在 Sentry、堆栈可读、收到邮件 → **验证后立即删除测试入口**。
- 触发一次客户端错误，确认 `global-error.tsx` 路径也能上报。

### 对测试/构建的影响
- vitest **不**会 import 这些 Sentry 配置文件，`instrumentation.ts` 只在 Next 运行时跑，`withSentryConfig` 只影响 `next build` —— 现有单测不受影响。
- 验收前跑 `pnpm typecheck` + `pnpm build` + `pnpm test` 确认全绿。

---

## 第二块：Cloudflare 流量 + 安全（基本零代码，AI 出文档 + 尽量自动配告警）

Cloudflare 挡在网站最前面、**本来就在记**每条请求，只是用户没去看。本块交付一份指南，把"在哪看 + 开哪些免费告警"讲清楚。

### 交付物：`docs/MONITORING.md`
- **看流量**：CF Dashboard → 选 zone `pacificdrone.ca` → **Analytics & Logs → Traffic**：请求数、独立访客、带宽、Top 路径、状态码分布、来源国家。
- **看安全**：**Security → Events**（WAF / 防火墙事件，`RPASApp` 允许规则也在这块）、**Security → Analytics**。
- **开告警**：CF → **Notifications**。**诚实预期**：Free 档可用的通知有限（如证书到期、账号安全、部分 DDoS 告警），"错误率 / 流量异常"等精细告警多数需 Pro —— 列为以后升级项，不阻塞 v1。
- **（可选）Cloudflare Web Analytics**：免费、隐私友好的页面级访客统计（需挂一个 beacon 脚本）。v1 先用 zone 自带 Traffic 面板（零脚本），Web Analytics 标注为可选增强。

### 自动化
`.env` 里有 `CLOUDFLARE_API_TOKEN`。**能用 API 自动创建的免费告警，AI 直接配好**；配不了的（受 token scope 或套餐限制）给出后台点击步骤。

---

## 隐私 / 合规

- 用 Sentry = 把"报错数据"交给一个第三方处理者。发布前写隐私政策（受众为加拿大，注意 PIPEDA）时，需把 **Sentry + Cloudflare 列为数据处理方 / 子处理者**。
- 已通过 `sendDefaultPii: false` + 关闭 Replay 把上报的个人信息降到最低。

## 验收标准

1. 故意触发的**服务端错误**一分钟内出现在 Sentry，堆栈**可读（非压缩）**，且收到提醒邮件。
2. **客户端崩溃**（`global-error.tsx` 路径）也能被捕获。
3. `docs/MONITORING.md` 存在；用户确认能在 Cloudflare 看到 Traffic 与 Security，并已打开至少一个可用告警。
4. `pnpm typecheck` / `pnpm build` / `pnpm test` 全部通过；测试用的临时抛错入口已删除。

## 分工

**用户做：**
1. 注册免费 Sentry 账号 → 新建项目（平台选 Next.js）→ 把 **DSN** 发给我。
2. （强烈建议）在 Sentry 建一个 **auth token**（用于 source map）→ 发我，或自行填到 Vercel。
3. 设计/实施按本文走；发布前把 Sentry、Cloudflare 写进隐私政策。

**AI 做：**
- 装 `@sentry/nextjs`、写 4 个初始化文件 + `global-error.tsx`、包 `next.config.ts`、配 `.gitignore`。
- 用 Vercel CLI 把 Sentry env 配到 Production（+ 可选 Preview）+ 本地 `.env` / `.env.example`。
- 造测试错误验证、删除测试入口。
- 写 `docs/MONITORING.md`，尽量用 API 自动配 Cloudflare 免费告警。
- 跑 typecheck / build / test 验收。

## 涉及文件清单

**新增：** `sentry.server.config.ts`、`sentry.edge.config.ts`、`instrumentation-client.ts`、`instrumentation.ts`、`app/global-error.tsx`、`docs/MONITORING.md`
**修改：** `next.config.ts`、`package.json`（+ lockfile）、`.env`、`.env.example`、`.gitignore`、Vercel 环境变量（Production [+ Preview]）

## 已知交互 / 风险

- **不启用 `tunnelRoute`**：Sentry 的 tunnel（如 `/monitoring`）会被现有 i18n 中间件 matcher `'/((?!api|_next|_vercel|.*\\..*).*)'` 命中并重定向到 `/en/monitoring`，破坏 tunnel。要用 tunnel 必须改 middleware matcher 排除它 —— v1 不值得，默认关闭（代价：极少数装了拦截器的浏览器可能拦下发往 sentry.io 的上报）。
- **source map 依赖 `SENTRY_AUTH_TOKEN`**：不配则生产堆栈不可读。建议必配。
- **Sentry 免费额度** 5k 错误/月，超了当月丢弃 —— 发布前流量小，足够。
- **Cloudflare Free 告警有限**：精细告警要 Pro，作为升级项，不阻塞本期。

## 不在本期、未来可选

- 自建请求明细账本 + coriander 后台日志页（独立立项）。
- Session Replay、Vercel log drain（需 Pro）、Cloudflare Web Analytics beacon、更精细的 Cloudflare 告警（需 Pro）。
