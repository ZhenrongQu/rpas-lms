# 环境配置 — DEV / PRODUCTION

> 状态：**已实现（2026-06-11）**。dev 暴露方式选定 = **固定 `dev` 分支**（无自定义子域名）。
> 目标：把"本地开发 → 推 GitHub → 上线 production"做成正式的 dev/prod 两环境，并修掉隐患（本地 `.env` 曾直连生产库）。

## ✅ 已落地（2026-06-11）
- **本地 `.env` 已摘离生产库** → 现指向 dev 库（Supabase 项目 `pacificdrone-dev`，ref `yifyzuvktgbrjwirbmbt`，ca-central-1）。生产串备份为注释 `PROD_DATABASE_URL`/`PROD_DIRECT_URL`。本地无论在哪个 git 分支，`next dev` 都打 dev 库。
- **dev 库已就绪**：`prisma migrate deploy`（init + RLS 触发器）+ `seed:content`（150 题 / 13 课）+ dev 管理员（`devadmin` / robbieqzr@gmail.com，密码在 `.env` 注释 `DEV_ADMIN_PASSWORD`）。
- **`dev` 分支** 已建并推到 origin，作为 dev 部署环境。dev URL = **`https://dev.pacificdrone.ca`**（Cloudflare CNAME `dev`→`cname.vercel-dns.com`，**灰云 DNS-only**；Vercel 域名绑 `dev` 分支；cert = Let's Encrypt 已签发）。备用别名 `rpas-lms-git-dev-rpas-lms-projects.vercel.app`。**Vercel Deployment Protection 开启**（`ssoProtection: all_except_custom_domains`）→ 访问 dev 需先在浏览器登录 Vercel 账号（登一次 cookie 记住）；他人无法访问，除非加入 Vercel team。Hobby 套餐下只有「公开」或「Vercel 登录」两选项（密码/IP 保护是 Pro）。
- **Vercel Preview scope（绑 `dev` 分支）已设 6 个变量**：`DATABASE_URL`/`DIRECT_URL`（dev 库）、独立 `AUTH_SECRET`、`APP_URL`（= 上面别名）、`RESEND_API_KEY`/`EMAIL_FROM`（复用生产）。生产 scope 未动。
- **本地 Stripe 已切 test**（修了第二个隐患：本地原本是 `rk_live_` + 生产 price，点购买会创建真实 LIVE checkout）。现本地 `STRIPE_SECRET_KEY`→`sk_test_`、`STRIPE_ADVANCED_BUNDLE_PRICE_ID`→ test price `price_1ThJC49PdDm7daK3QuPUu3aE`（test product `prod_UggZCstvebuXOx`，占位 199 CAD）；live 值备份为注释 `PROD_STRIPE_*`。本地测支付：`stripe listen --forward-to localhost:3000/api/payments/webhook`（whsec 以它打印的为准）。
- **部署态 dev 不跑支付（已决定）**：test 支付一律在本地跑；部署态 dev preview 维持 Vercel 保护、Preview scope 不配 Stripe（点购买会报错，其余正常）。

## 推荐架构（Vercel 原生三环境）

| 环境 | 触发 | 数据库 | Stripe | 地址 |
|---|---|---|---|---|
| **Production** | 推/合并到 `main` | Supabase **prod**（现有）| live | pacificdrone.ca |
| **Preview**（=dev 上线版）| 推 `dev`/功能分支、开 PR | Supabase **dev**（新建）| test | 自动 preview URL（可选绑 `dev.pacificdrone.ca`）|
| **Development**（本地）| `next dev` + `.env` | Supabase **dev** | test | localhost:3000 |

**工作流**：`dev`/功能分支开发 → push GitHub → Vercel 自动建 Preview（连 dev 库）验证 → PR 合并到 `main` → 自动上 production。

## ⚠️ 隐患（已修复 2026-06-11）
~~本地 `.env` 的 `DATABASE_URL`/`DIRECT_URL` 指向**生产库** → 本地 `next dev` 会读写生产数据。~~ 已切到 dev 库，生产串降级为注释备份。

## 实施步骤（明天）
1. **新建第二个 Supabase 项目** `pacificdrone-dev`（免费层，区域同 ca-central-1），拿 pooler(6543) + 直连(5432) 串。
2. **本地 `.env`** 的 `DATABASE_URL`/`DIRECT_URL` 换成 dev 库（prod 串挪去注释备用）。
3. 对 dev 库跑 `prisma migrate deploy` + `pnpm seed:content`（Claude 来）。
4. **Vercel 环境变量按 scope 分**（Claude 用 CLI 做）：
   - `Preview` scope：`DATABASE_URL`/`DIRECT_URL` = dev 库；Stripe = **test** key；`APP_URL` = preview/dev 地址
   - `Production` scope：保持 prod 库 + Stripe **live**（已有）
   - 建议把 `AUTH_SECRET` 在 Preview 用**另一个值**（dev 会话不通用到 prod）
5.（可选）Cloudflare 加 `dev.pacificdrone.ca` → 绑 `dev` 分支（Claude 用 API 做）。

## 迁移工作流
- 开发时对 **dev 库** 跑 `prisma migrate dev` 生成迁移并提交。
- 上线时对 **prod 库** 手动 `prisma migrate deploy`（我们没把 migrate 塞进 build，避免 preview 误迁生产）。

### ⚠️ 迁移纪律（2026-06-16 漂移事故复盘）
**事故**：lesson 视频字段 + Flight Review 两张表当初只 `prisma db push` 到了 dev，**没生成迁移**。prod 只跑 `migrate deploy`，于是一直缺这些表/列。用户用新开的 Google 登录进 `/dashboard` → 查 `FlightReviewBooking` → 500。
**已修**：从 prod→schema diff 生成迁移 `20260616154112_add_lesson_video_and_flight_review`（纯新增 ADD COLUMN / CREATE TABLE），`migrate deploy` 到 prod、dev `migrate resolve --applied`。

**铁律**：
- 任何会上生产的 schema 改动，**必须** `prisma migrate dev --name xxx` 生成迁移并提交。**禁止**只用 `db push`（它只配本地一次性试验）。
- **上线前自查漂移**（只读，exit code 2 = 有漂移，先补迁移再上）：
  ```bash
  PROD='<prod session-pooler URL :5432>'
  pnpm exec prisma migrate diff --from-url "$PROD" --to-schema-datamodel prisma/schema.prisma --exit-code
  ```
- 备注：对 prod/dev 跑 migrate/diff 用 **session pooler 端口 `:5432`**（`:6543` 是 transaction 模式，migrate 会卡住）。

## 待定 / 后续
- ~~dev 暴露方式~~：已选 **固定 `dev` 分支** + **`dev.pacificdrone.ca`** 自定义子域名（2026-06-11 加，灰云 DNS-only）。
- ~~dev 的 Stripe~~：已决定 **test 支付只在本地跑**（部署态 dev 不配 Stripe，维持 Vercel 保护）。若将来要让部署态 dev 也跑支付，需让 Stripe webhook 穿过 Vercel Preview Protection（关保护变公开，或用 Protection Bypass token），再注册 dev test webhook + 配 3 个 `STRIPE_*` 到 Preview@dev。
- 测试库：本地 vitest 仍用 Docker Postgres :5433（已就绪），与 dev 库分开，无需动。
