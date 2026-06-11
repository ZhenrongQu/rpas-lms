# 环境配置计划 — DEV / PRODUCTION（明天实现）

> 状态：计划（2026-06-10 记录，**明天实现**）。
> 目标：把"本地开发 → 推 GitHub → 上线 production"做成正式的 dev/prod 两环境，并**修掉当前隐患**（本地 `.env` 直连生产库）。

## 推荐架构（Vercel 原生三环境）

| 环境 | 触发 | 数据库 | Stripe | 地址 |
|---|---|---|---|---|
| **Production** | 推/合并到 `main` | Supabase **prod**（现有）| live | pacificdrone.ca |
| **Preview**（=dev 上线版）| 推 `dev`/功能分支、开 PR | Supabase **dev**（新建）| test | 自动 preview URL（可选绑 `dev.pacificdrone.ca`）|
| **Development**（本地）| `next dev` + `.env` | Supabase **dev** | test | localhost:3000 |

**工作流**：`dev`/功能分支开发 → push GitHub → Vercel 自动建 Preview（连 dev 库）验证 → PR 合并到 `main` → 自动上 production。

## ⚠️ 必须先修的隐患
当前本地 `.env` 的 `DATABASE_URL`/`DIRECT_URL` 指向**生产库** → 本地 `next dev` 会读写生产数据。配 dev 环境时一并解决。

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

## 待定（明天先确认）
- dev 暴露方式：**(a) 每 PR 自动 Preview**（推荐起步，零配置）vs **(b) 固定 `dev` 分支 + `dev.pacificdrone.ca`**。
- 测试库：本地 vitest 仍用 Docker Postgres :5433（已就绪），与 dev 库分开，无需动。
