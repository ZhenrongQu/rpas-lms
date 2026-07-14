# RPAS LMS

[English](README.md) | **中文**

RPAS LMS 是一个基于 Next.js 的加拿大 RPAS / 无人机飞行员执照学习与模拟考试平台。当前项目重点放在 Basic Operations 和 Advanced Operations 的模拟考试体验上：支持 EN/ZH 双语界面、题库校验、服务端生成试卷与评分、考试 session 持久化、账号注册登录、考试历史、成绩页，以及提交后的逐题解析。

课程内容（题库、课程、checkpoint）现在存在 PostgreSQL 里，通过 `/coriander` 后台 CMS 维护；界面文案仍放在 locale message 文件里；用户、考试 session、支付与权限通过 Prisma + PostgreSQL（Supabase）持久化。

平台还内置两个 LLM agent（见 [`src/lib/agents/`](#srclibagents)）：一个面向付费用户的 AI 学习助手（基于课程内容的混合 RAG 检索），以及一个离线的 remediation（自动修复）agent，把可复现的测试失败转化为人工审核的补丁提案。

## 技术栈

- **Next.js App Router**：负责页面路由和 API route。
- **React + TypeScript**：负责 UI 和应用逻辑。
- **next-intl**：负责基于路由的 EN/ZH 国际化。
- **Prisma + PostgreSQL（Supabase）**：负责数据持久化（dev 和 prod 都是 Postgres）。
- **Auth.js / NextAuth v5**：负责 Google、Apple、验证码登录，以及已验证邮箱的旧密码登录兼容；Admin 与 Customer 是分离的表。
- **Stripe**：负责 paid_access（Advanced 套餐）和 flight_review 两个产品的支付与权限。
- **Cloudflare Stream**：负责课程视频上传与播放。
- **Resend**：负责邮箱验证码与 flight-review 预约通知邮件。
- **Anthropic SDK**：驱动 AI 学习助手和 remediation agent 的修复模型（不配置 `ANTHROPIC_API_KEY` 时应用照常运行，仅这两个功能不可用）。
- **Zod**：负责题库和 API 请求体校验。
- **Vitest**：负责单元测试和 route handler 测试。
- **Tailwind CSS + 自定义 CSS**：负责无人机 HUD 风格界面。

## 快速启动

```bash
cd /Users/quzhenrong/rpas-lms
pnpm install
pnpm exec prisma db push
pnpm dev
```

然后打开：

- `http://localhost:3000/en`
- `http://localhost:3000/zh`

常用命令：

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm db:generate
pnpm db:push
```

## 环境变量

从 `.env.example` 创建 `.env`：

```env
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1"  # Supavisor pooler，运行时
DIRECT_URL="postgresql://...:5432/postgres"  # 直连，仅 prisma migrate / db push 用
AUTH_SECRET="generate-with: openssl rand -base64 32"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
APPLE_CLIENT_ID=""
APPLE_CLIENT_SECRET=""
```

`DATABASE_URL` / `DIRECT_URL` 指向 Prisma 使用的 PostgreSQL（Supabase）数据库，dev 和 prod 都是 Postgres，没有 SQLite 路径。完整变量见 `.env.example`（含 Stripe、Resend、Cloudflare Stream）。`AUTH_SECRET` 是 Auth.js 用来签名 session/JWT 数据的密钥。Google 和 Apple 的变量用于 OAuth 登录；本地未配置时仍可使用邮箱/手机验证码流程。
未配置 Google 或 Apple 的 client id/secret 时，页面会禁用对应第三方登录按钮，避免跳转到 provider 的 `invalid_request` 页面。

## 当前用户流程

1. 学员访问 `/en` 或 `/zh`。
2. Guest 用户可以访问 `/[locale]/intro`，查看公司介绍、服务介绍和课程介绍。
3. 用户可以通过 Google、Apple，或本地账号登录。本地账号注册需要邮箱、密码和邮箱验证码；登录时可使用邮箱、手机号或用户名加密码。
4. 注册用户默认是 `FREE`，可以启动 Basic 模拟考试，但只使用 `difficulty: 0` 的免费题目。
5. 完整题库和 Advanced 模拟考试预留给 `PAID` 用户。
6. 客户端只拿到公开题目信息，不包含正确答案。
7. 客户端按题提交所选 option id。
8. 提交考试后，服务端评分并保存结果，同时返回错题解析。
9. 成绩页展示分数、通过/失败状态、按科目拆分的结果和所有错题解释。
10. 已登录用户可以在 Mission Log 中看到已提交的考试记录。

Registered users are `FREE` by default. Free users can access free lessons and questions marked `difficulty: 0`; paid users can access the full question bank. Local users must verify email before password login.

## 项目结构

```text
rpas-lms/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── exam/
│   │   ├── intro/
│   │   ├── signin/
│   │   └── register/
│   ├── api/
│   │   ├── auth/
│   │   └── exam/
│   ├── globals.css
│   └── layout.tsx
├── content/
├── docs/
├── messages/
├── prisma/
├── src/
│   ├── components/
│   ├── i18n/
│   └── lib/
├── types/
├── auth.ts
├── middleware.ts
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## 目录说明

### `app/`

Next.js App Router 页面目录。

- `app/layout.tsx` 是根 HTML layout，负责加载字体和全局 CSS。
- `app/[locale]/layout.tsx` 是本地化页面 layout，负责接入 `NextIntlClientProvider`、HUD 背景层和顶部 header。
- `app/[locale]/page.tsx` 是主 dashboard 页面。
- `app/[locale]/intro/page.tsx` 是 guest 可访问的免费介绍模块。
- `app/[locale]/exam/page.tsx` 是考试启动页。
- `app/[locale]/exam/[id]/page.tsx` 在服务端读取考试元数据，然后渲染客户端考试 UI。
- `app/[locale]/exam/[id]/ExamClient.tsx` 是交互式计时考试界面。
- `app/[locale]/exam/[id]/results/page.tsx` 展示成绩和科目拆分。
- `app/[locale]/exam/[id]/review/page.tsx` 展示提交后的逐题解析。
- `app/[locale]/signin/page.tsx` 和 `app/[locale]/register/page.tsx` 是登录/注册页面。
- `app/globals.css` 包含主要 HUD 视觉系统和页面布局样式。

### `app/api/`

前端调用的 API route handler。

- `app/api/auth/[...nextauth]/route.ts` 暴露 Auth.js handlers。
- `app/api/auth/register/route.ts` 是已停用的旧邮箱密码注册入口；新注册必须走验证码或 OAuth。
- `app/api/auth/code/request/route.ts` 请求邮箱/手机 6 位验证码。
- `app/api/auth/code/verify/route.ts` 校验验证码并创建或复用免费用户。
- `app/api/auth/register/username/route.ts` 通过已验证联系方式或当前登录 session 绑定用户名。
- `app/api/auth/username/check/route.ts` 检查用户名是否可用。
- `app/api/exam/route.ts` 创建模拟考试 session。
- `app/api/exam/[id]/questions/route.ts` 返回某个 session 的公开题目。
- `app/api/exam/[id]/answer/route.ts` 保存用户选择的 option ids。
- `app/api/exam/[id]/submit/route.ts` 提交并评分考试。
- `app/api/exam/[id]/result/route.ts` 返回已保存的成绩结果。
- `app/api/exam/[id]/review/route.ts` 返回提交后的逐题解析数据。
- 该目录下的 `*.test.ts` 文件用于在不启动服务器的情况下测试 route handler 行为。

### `src/components/`

可复用 UI 组件。

- `auth/` 放认证相关 UI 辅助组件，例如退出登录按钮。
- `dashboard/` 放 dashboard 卡片、考试历史、侧边栏和进度环。
- `exam/` 放考试界面组件，例如题目导航、题目卡片和计时器。
- `layout/` 放 HUD header。
- `results/` 放成绩页组件，例如按科目拆分结果。

### `src/lib/exam/`

考试引擎目录，也是当前最重要的业务逻辑目录。

- `config.ts` 定义 Basic/Advanced 的题目数量、时间限制、通过线和科目权重。
- `quota.ts` 根据权重表计算各科目抽题配额。
- `rng.ts` 提供可复现的 seeded random。
- `generate.ts` 根据证书等级选择 eligible questions，并生成加权试卷。
- `grade.ts` 判断用户选择的 option ids 是否与正确答案集合完全一致。
- `score.ts` 生成总分、通过/失败状态和按科目拆分的成绩。
- `serialize.ts` 在题目发给客户端前移除敏感字段。
- `review.ts` 在提交后生成逐题解析，包括正确答案和解释。
- `store.ts` 定义 `SessionStore` 接口和用于测试的内存 store。
- `prismaStore.ts` 通过 Prisma 把考试 session 持久化到 PostgreSQL。
- `service.ts` 编排完整考试生命周期：创建、取题、答题、提交、结果、解析。
- `instance.ts` 创建全应用共享的 `ExamService` 实例。

### `src/lib/content/`

题库领域模型和校验逻辑。

- `types.ts` 定义模块、证书等级、题型和题库 TypeScript 类型。
- `schema.ts` 使用 Zod 校验 JSON 题库，并检查正确答案数量等不变量。
- `loadBank.ts` 加载并缓存 `content/question-bank.json`。
- `*.test.ts` 文件验证 schema 和 loader 行为。

### `src/lib/auth/`

认证与账号服务。

- `password.ts` 使用 `bcryptjs` 哈希和校验密码。
- `types.ts` 定义认证 provider、验证码 channel 和访问等级类型。
- `verificationCode.ts` 生成、哈希、校验、消费邮箱/手机 6 位验证码，并限制失败次数。
- `delivery.ts` 封装验证码发送接口；开发/测试环境会输出到控制台，后续可替换为真实邮件或短信服务。
- `account.ts` 创建/复用邮箱、手机号、用户名和 OAuth 用户，并维护 `UserIdentity`。

### `src/lib/agents/`

两个 LLM agent，以及它们共用的小型运行时。

- `runtime.ts` 是共享的 agent 循环：服务端工具执行、step 预算、单次与累计 token 硬上限（类型化的 `BudgetExhausted` 错误），并留有模型注入接缝，单元测试无需 API key 即可密闭运行。

#### `agents/chat/` —— 付费 AI 学习助手

支撑 `POST /api/chat`（仅付费用户；网关顺序在花费任何 token 之前完成：401 未登录 → 402 未付费 → 429 限流）。路由以纯文本增量流式返回；工具全部在服务端执行，永不暴露给客户端。

- `loop.ts`（`runAssistant`）在共享运行时上驱动对话。
- `tools.ts` 定义模型可调用的工具（课程查询、进度、检索）。
- `rag/` 是基于课程内容的混合检索：pgvector 余弦检索 + 加权关键词检索，经 Reciprocal Rank Fusion 融合（`retrieve.ts`），Voyage embeddings（`embed.ts`），分块与入库（`chunk.ts`、`ingest.ts`）写入 `KnowledgeChunk` 表，按 locale 和证书等级隔离。
- 离线 eval：`scripts/eval/`（`pnpm eval:assistant`）用确定性检查 + LLM judge 给固定用例打分——改动 prompt 或工具前后都应跑一遍。

#### `agents/remediation/` —— 离线 remediation（自动修复）agent

把一个可复现的测试失败转化为可审计、人工审核的补丁提案。模型负责写修复；每一个接受/拒绝的裁决都由确定性代码做出。

- `state.ts` / `store.ts`——持久化在 Postgres 里的显式阶段状态机，租约并发控制：每次状态转移都是以"仍持有未过期租约"为条件的 compare-and-swap，证据与转移原子写入（崩溃后可安全恢复），终态自动释放租约。
- `reproduce.ts` / `worktree.ts`——在隔离的 git worktree 里于已知 commit 复现失败（复现两次以排除 flaky），并在任何修复开始前将失败签名与事故匹配。
- `repair.ts` / `llm/repairer.ts`——受限能力的修复器：读白名单、单一可写路径、字节上限的文件与工具 I/O，以及记录模型实际行为的有界脱敏 trace。
- `fixAttempt.ts` / `verify.ts`——收集证据包（修复前红、修复后绿、diff 统计、patch），交给有序的确定性门禁裁决。隐藏的 holdout 测试仅在 patch 捕获之后注入——模型既读不到也改不了——可见测试另有哈希后盾防篡改。
- `publish.ts`——把通过验证的 patch 发布为幂等、只追加的 draft-PR 提案。
- 离线 eval：`scripts/agents/repair-eval.ts`（`pnpm eval:repair`）让真实模型跑分级用例目录、穿过同一条生产管道；用例只有到达预期终态才算通过，"零错误提案"作为硬安全线单独报告。它拒绝对非本地数据库运行。

### `src/lib/db.ts`

Prisma client 单例。开发环境下它会把 client 缓存在 `globalThis` 上，避免热更新时反复创建数据库连接。

### `src/i18n/`

国际化配置。

- `routing.ts` 定义支持的 locale：`en` 和 `zh`。
- `request.ts` 把 `next-intl` 接入 App Router 请求处理。

### `content/`

内容相关说明文件（题库本身已迁移到数据库，通过 `/coriander` 后台 CMS 维护，不再是 JSON 文件）。

- `question-bank-README.md` 说明题目编写规则、schema、当前覆盖情况和题库容量缺口。
- `content/lessons/` 保留课程 MDX 的初始种子素材，由 `pnpm seed:content` 导入数据库。

题目包含双语题干、选项、解释和参考来源。正确答案存在数据库里，但考试进行中永远不会发送给客户端（见 `serialize.ts`）。

### `messages/`

UI 翻译文案。

- `en.json` 保存英文 UI 文案。
- `zh.json` 保存中文 UI 文案。

这些文件驱动按钮、标签、dashboard 文本、考试文本、成绩页文本和解析页文本。

### `prisma/`

数据库 schema（PostgreSQL）。

- `schema.prisma` 定义身份（分离的 `Admin` / `Customer`，无共享 role 字段）、`UserIdentity`、`VerificationCode`、`RateLimit`、`ExamSession`、支付与权限（`Payment` / `Entitlement` / `WebhookEvent`）、flight-review（`FlightReviewSlot` / `FlightReviewBooking`）、按等级拆分的题库（`Basic/AdvancedQuestionBank` + options）、`CheckpointQuestion`，以及课程与进度（`Basic/AdvancedLesson` + `*LessonProgress`）。

题库、课程、checkpoint 都是数据库表，不再来自 JSON 文件。

### `docs/`

项目说明、设计和历史记录。

- `technical-design.md` 是更完整的 LMS + 考试平台技术设计文档。
- `PROGRESS.md` 记录已完成计划、实现历史和已知缺口。
- `ui-prototype.html` 是较早的静态 UI 原型。
- `docs/superpowers/` 保存之前实现过程中的计划文档。

### `types/`

项目级 TypeScript 类型扩展。

- `next-auth.d.ts` 扩展 NextAuth session/user 类型，让 `session.user.id` 可用。

## 核心概念

### Guest Session

Guest 用户不登录只能访问免费介绍模块，不能启动考试。考试 session 现在要求登录后创建。免费注册用户默认是 `FREE` 访问等级，可以使用 Basic 中标记为 `difficulty: 0` 的免费题目；完整题库和 Advanced 考试预留给 `PAID` 访问等级。

### 注册和登录

支持的注册/登录方式包括：

- Google OAuth
- Apple OAuth
- 邮箱 6 位验证码
- 手机 6 位验证码
- 用户名注册，其中用户名必须绑定一个已验证邮箱或手机号
- 旧版邮箱密码登录仍保留，用于兼容已有且邮箱已验证的本地账号

验证码目前通过 `delivery.ts` 抽象发送。开发和测试环境不会连接真实短信/邮件供应商，只会生成本地可验证的验证码记录；生产接入供应商时应替换该发送层。

### 服务端评分边界

考试进行中，正确答案必须留在服务端。前端调用 `/api/exam/[id]/questions` 时，拿到的是由 `serialize.ts` 生成的公开题目数据。它会去掉 `isCorrect`、`explanation` 和 `reference`。

只有在考试提交后，应用才会通过 review 逻辑展示正确答案和解释。

### Exam Result vs. Exam Review

Result 是成绩汇总：

- 总题数
- 答对数量
- 百分比
- 通过/失败
- 按科目拆分

Review 是逐题解释视图。提交接口会直接返回错题 review，成绩页也会直接展示错题解释；完整 review 页仍然可以查看全部题目：

- 题干
- 用户选择的 option ids
- 正确 option ids
- 所有选项及正确性
- 解释
- 参考来源

当前代码里这两个流程是有意分开的。

## 测试

项目使用 Vitest，并从 `src/` 和 `app/` 两个目录收集测试。

```bash
pnpm test
```

测试跑在真实的本地 Postgres 上（与 prod 一致），不是内存库。默认连 `postgresql://postgres:postgres@localhost:5433/postgres`，可用 `TEST_DATABASE_URL` 覆盖。起一个一次性容器：

```bash
docker run -d --name rpas-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 pgvector/pgvector:pg16
```

必须用 `pgvector/pgvector` 镜像（而不是原生 `postgres:16`）：RAG 的 `KnowledgeChunk` 表带有 pgvector `vector` 列，`prisma db push` 需要 `vector` 扩展可用。

配置见 `vitest.config.mts`。`vitest.globalSetup.ts` 会在测试前重置并 `db push` schema。所有测试文件共用一个库，因此串行执行（`fileParallelism: false`）。

## 已知缺口

- Advanced 模拟考试 eligible 题目数量可能少于配置目标。详见 `content/question-bank-README.md`。
- 支付已接入 Stripe（`paid_access` / `flight_review` 两个产品）；权限以 `Entitlement` 表为准，`Customer.accessTier` 是反规范化缓存。
- 考试答案目前作为 JSON 存在 `ExamSession` 上，不是独立的 `ExamAnswer` 行。

## 推荐阅读顺序

如果你想最快理解这个项目，建议按这个顺序读：

1. 读 `app/[locale]/exam/page.tsx`，理解考试如何启动。
2. 读 `app/api/exam/route.ts`，理解 session 如何创建。
3. 读 `src/lib/exam/service.ts`，理解考试生命周期。
4. 读 `src/lib/exam/serialize.ts`、`score.ts` 和 `review.ts`，理解安全边界。
5. 读 `prisma/schema.prisma`，理解哪些数据被持久化。
6. 修改题目前，先读 `content/question-bank-README.md`。

## 本地 / Dev 测试账号

测试账号与密码不放进仓库。凭据见本地（未跟踪、被 `.gitignore` 忽略）的 `password.md`。

用脚本重建或改密（脚本在本地 `scripts/`，默认连 `.env` 的 dev 库）：

```bash
# 管理员 → Admin 表，登录 /coriander
ADMIN_USERNAME=<user> ADMIN_PASSWORD='<password>' ADMIN_EMAIL=<email> pnpm exec tsx scripts/create-admin.ts

# 顾客 → Customer 表（CUSTOMER_TIER 可选 FREE/PAID）
CUSTOMER_EMAIL=<email> CUSTOMER_PASSWORD='<password>' CUSTOMER_USERNAME=<user> CUSTOMER_TIER=PAID pnpm exec tsx scripts/create-customer.ts
```

