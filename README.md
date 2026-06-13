# RPAS LMS

RPAS LMS 是一个基于 Next.js 的加拿大 RPAS / 无人机飞行员执照学习与模拟考试平台。当前项目重点放在 Basic Operations 和 Advanced Operations 的模拟考试体验上：支持 EN/ZH 双语界面、题库校验、服务端生成试卷与评分、考试 session 持久化、账号注册登录、考试历史、成绩页，以及提交后的逐题解析。

这个项目目前刻意保持轻量和文件驱动：题目放在 JSON 文件里，界面文案放在 locale message 文件里，用户与考试 session 通过 Prisma + SQLite 持久化。

## 技术栈

- **Next.js App Router**：负责页面路由和 API route。
- **React + TypeScript**：负责 UI 和应用逻辑。
- **next-intl**：负责基于路由的 EN/ZH 国际化。
- **Prisma + SQLite**：负责本地数据持久化。
- **Auth.js / NextAuth v5**：负责 Google、Apple、验证码登录，以及已验证邮箱的旧密码登录兼容。
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
DATABASE_URL="file:./dev.db"
AUTH_SECRET="generate-with: openssl rand -base64 32"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
APPLE_CLIENT_ID=""
APPLE_CLIENT_SECRET=""
```

`DATABASE_URL` 指向 Prisma 使用的 SQLite 数据库。`AUTH_SECRET` 是 Auth.js 用来签名 session/JWT 数据的密钥。Google 和 Apple 的变量用于 OAuth 登录；本地未配置时仍可使用邮箱/手机验证码流程。
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
- `prismaStore.ts` 通过 Prisma 把考试 session 持久化到 SQLite。
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

### `src/lib/db.ts`

Prisma client 单例。开发环境下它会把 client 缓存在 `globalThis` 上，避免热更新时反复创建数据库连接。

### `src/i18n/`

国际化配置。

- `routing.ts` 定义支持的 locale：`en` 和 `zh`。
- `request.ts` 把 `next-intl` 接入 App Router 请求处理。

### `content/`

内容源文件。

- `question-bank.json` 是考试题目的唯一来源。
- `question-bank-README.md` 说明题目编写规则、schema、当前覆盖情况和题库容量缺口。

题目包含双语题干、选项、解释和参考来源。正确答案也在这个文件中，但考试进行中永远不会发送给客户端。

### `messages/`

UI 翻译文案。

- `en.json` 保存英文 UI 文案。
- `zh.json` 保存中文 UI 文案。

这些文件驱动按钮、标签、dashboard 文本、考试文本、成绩页文本和解析页文本。

### `prisma/`

数据库 schema 和本地 SQLite 文件。

- `schema.prisma` 定义 `User`、`UserIdentity`、`VerificationCode` 和 `ExamSession`。
- `dev.db` 是本地开发 SQLite 数据库。
- `test.db` 是 Vitest 使用的 SQLite 测试数据库。

当前 schema 持久化用户、登录身份、验证码和考试 session。题目内容仍然来自 JSON 文件，而不是数据库表。

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

测试数据库在 `vitest.config.ts` 中配置：

```ts
DATABASE_URL: "file:./test.db"
```

`vitest.globalSetup.ts` 会在测试前重置并同步 Prisma schema。

## 已知缺口

- Advanced 模拟考试当前 eligible 题目数量少于配置的 50 题目标。详见 `content/question-bank-README.md`。
- 当前没有支付流程；`PAID` 只是用户访问等级字段，需要后续接入购买/支付后更新。
- Dashboard 的 module progress 仍然是占位数据。
- 旧版邮箱密码登录没有密码重置流程；新用户应使用 OAuth 或验证码登录。
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

> ⚠️ **仅限本地 / dev 数据库的测试账号，弱口令，切勿用于生产。** 生产库用的是团队真实账号（`testrobbie` / `testenoch` / `robbietest`），密码各自保管，不在此列出。

| 角色 | 登录方式 | 密码 | 说明 |
| --- | --- | --- | --- |
| Admin | 用户名 `rpasadmin`（或邮箱 `admin@rpas.test`） | `admin12345` | 登录后台 `/coriander` |
| Customer | 邮箱 `learner@rpas.test`（或用户名 `learner1`） | `learner12345` | PAID 档，普通登录 |

随时用脚本重建或改密（默认连 `.env` 的 dev 库）：

```bash
# 管理员 → Admin 表，登录 /coriander
ADMIN_USERNAME=rpasadmin ADMIN_PASSWORD='admin12345' ADMIN_EMAIL=admin@rpas.test pnpm exec tsx scripts/create-admin.ts

# 顾客 → Customer 表，创建即可登录（CUSTOMER_TIER 可选 FREE/PAID）
CUSTOMER_EMAIL=learner@rpas.test CUSTOMER_PASSWORD='learner12345' CUSTOMER_USERNAME=learner1 CUSTOMER_TIER=PAID pnpm exec tsx scripts/create-customer.ts
```