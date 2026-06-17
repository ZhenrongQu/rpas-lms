# 部署 步骤 D — 第三方密钥 / DNS（Stripe · Resend · OAuth）

> 状态：草稿（2026-06-10 创建，之后完善）。
> 前置：步骤 A（Supabase）、B（Vercel）、C（Cloudflare 域名 `pacificdrone.ca` 上线）均已完成。
> 生产域名：**https://pacificdrone.ca**　| Vercel 项目 `rpas-lms` / scope `rpas-lms-projects`（Hobby）。

## 分工
- **你做**（账户级，我替不了）：开通 Stripe live、建 Product/Price、注册 Resend、拿各密钥。
- **我做**（有 `VERCEL_TOKEN` + `CLOUDFLARE_API_TOKEN`）：配 Vercel 环境变量、用 Cloudflare API 加邮件 DNS、加 WAF 规则、触发重部署、端到端验证。
- **密钥规矩**：写进本地 `.env`（gitignored），**不要贴聊天**；我从 `.env` 读后写进 Vercel。

---

## D1. Stripe（支付）
- [ ] 开通 **live 模式**（需完成商家验证，可能要审核时间）
- [ ] 建/确认正式 **Product + Price**（一次性付费解锁）→ 记下 **`STRIPE_ADVANCED_BUNDLE_PRICE_ID`（live, `price_...`）**
- [ ] 拿 **`STRIPE_SECRET_KEY`（live, `sk_live_...`）**
- [ ] 注册 **Webhook endpoint**：`https://pacificdrone.ca/api/payments/webhook`
      - 事件：`checkout.session.completed`
      - 创建后拿 **`STRIPE_WEBHOOK_SECRET`（`whsec_...`）**
- [ ] （我做）Vercel 生产环境设：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_ADVANCED_BUNDLE_PRICE_ID`
- [ ] （我做）Cloudflare WAF **Skip 规则放行** `/api/payments/webhook`（防 bot 设置拦 Stripe 的服务器 POST）
- 代码现状：webhook 验签 + `WebhookEvent` 幂等已实现（LAUNCH #25/#26 ✅），**无需改代码**。

## D2. Resend（邮件）
- [ ] 注册 Resend，**添加发信域名 `pacificdrone.ca`**
- [ ] Resend 给出 **SPF(TXT) / DKIM(CNAME×N) / DMARC(TXT)** 记录 → 把这些值发我，**（我做）用 Cloudflare API 加为 DNS-only（灰云）记录**
- [ ] 等 Resend 显示域名 **Verified**
- [ ] 拿 **`RESEND_API_KEY`**；定 **`EMAIL_FROM`**（如 `noreply@pacificdrone.ca`）
- [ ] （我做）Vercel 生产环境设：`RESEND_API_KEY` / `EMAIL_FROM`
- 代码现状：`src/lib/auth/delivery.ts`，生产必须有 `RESEND_API_KEY`，缺省 from = `noreply@rpasacademy.ca`（建议覆盖成 pacificdrone.ca）。

## D3. OAuth（可选，启用 Google/Apple 登录才需要）
- [ ] Google/Apple 控制台把**回调 URL** 改/加为 `https://pacificdrone.ca/api/auth/callback/{google|apple}`
- [ ] （我做）Vercel 设 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /（Apple 同理）
- 代码现状：`src/lib/auth/oauthConfig.ts` 条件挂载——不配就不显示这两个登录方式，不报错。

---

## Vercel 生产环境变量总表（D 要补的）
| 变量 | 来源 | 谁来设 |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe live | 我（读 .env）|
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook 注册后 | 我 |
| `STRIPE_ADVANCED_BUNDLE_PRICE_ID` | Stripe Price | 我 |
| `RESEND_API_KEY` | Resend | 我 |
| `EMAIL_FROM` | 你定（noreply@pacificdrone.ca）| 我 |
| `GOOGLE_*` / `APPLE_*` | OAuth 控制台（可选）| 我 |
> 已设好的：`DATABASE_URL` `DIRECT_URL` `AUTH_SECRET` `APP_URL`。

## 验证（端到端）
- [ ] live 小额或测试钟跑一次 checkout → webhook 触发 → `Entitlement` 行生成 → 刷新显示 PAID
- [ ] `curl -I https://pacificdrone.ca/api/payments/webhook` 不被 WAF 挡（Stripe CLI 重发事件验证）
- [ ] 触发一封验证码邮件 → 送达且 DKIM pass

---

## 顺带：步骤 C 可选收尾（未做，不挡上线）
- [ ] `www.pacificdrone.ca` → 301 跳 apex（需再走一遍灰→橙出证）
- [ ] Cloudflare 限流规则：`/api/auth/*`、`/api/payments/checkout`（LAUNCH #22）
- [ ] 上线前把 Vercel 从 **Hobby 升 Pro**（商用要求）

## 与基础设施无关、但上线前仍需处理（独立 scope）
- 中文题库翻译（LAUNCH #13，`content/question-bank.json` 的 ZH 字段目前是 EN 拷贝）
- 占位文案（#15/#16）、法务页 Privacy/ToS（#18–21）、Sentry 监控（#23）
