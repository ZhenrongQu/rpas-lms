# 监控与日志 — 怎么看

本项目的可观测性分两块:**报错 → Sentry**(自动上报,出错有邮件);**流量 + 安全 → Cloudflare**(本来就在记,这里教你在哪看)。设计见 `docs/superpowers/specs/2026-06-16-request-logging-monitoring-design.md`。

## 一、报错(Sentry)

- 后台:https://sentry.io → 你的项目 → **Issues**。每个错误一条,点进去看堆栈(哪一行/什么原因)、发生次数、影响用户、所在环境(production / preview)。
- 邮件提醒:Sentry 默认对"新错误"发邮件。调整在 **Settings → Alerts**。
- 环境变量(配在 Vercel):`NEXT_PUBLIC_SENTRY_DSN`(上报地址)、`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`(构建时上传 source map,使堆栈可读)。本地 `.env` 只放 DSN。
- 隐私:已设 `sendDefaultPii: false`、未启用 Session Replay。**发布前**把 Sentry 写进隐私政策的"数据处理方"。

## 二、流量 + 安全(Cloudflare)

Cloudflare 挡在 `pacificdrone.ca` 最前面,每条请求都过它,所以无需写代码。

**看流量**:Cloudflare Dashboard → 选 zone `pacificdrone.ca` → **Analytics & Logs → Traffic**
- 请求数、独立访客、带宽、状态码分布(2xx/4xx/5xx)、Top 路径、来源国家、设备。
- 免费档数据保留期有限(约 24–72 小时的明细 + 更长的聚合);要长期错误历史看 Sentry。

**看安全**:**Security → Events**(WAF / 防火墙拦截记录,`RPASApp` App 允许规则也在这)、**Security → Analytics**。

**告警(Notifications)**:
- 免费档可开的(按你账号实际可选为准):SSL/TLS 证书到期、账号安全、部分 L7 DDoS 攻击告警。
- "错误率飙升 / 流量异常"等精细告警多为 Pro+,作为以后升级项。

> **自动配置结果(2026-06-16)**:仓库里的 `CLOUDFLARE_API_TOKEN` 是 **zone 级**令牌(只够管 DNS/zone),**无权访问账号级 Notifications**(`/accounts` 列表返回空),因此**无法用 API 自动创建告警**。请按下面手动开(约 2 分钟);若想以后让我自动配,需另建一个带 **Notifications:Edit** 的账号级 token。

**手动开启(免费告警)**:
1. https://dash.cloudflare.com → 右上角进入 **Notifications**(或 Manage Account → Notifications)。
2. 点 **Add** → 选一个你套餐里可选的类型(免费常见:**SSL/TLS Certificate** 证书到期、部分 **DDoS** 告警、账号安全)。
3. 命名 → 投递方式选 **Email** → 填你的邮箱 → **Save**。

## 三、本期不做(未来可选)

自建请求明细账本(每条请求入库 + 后台日志页)、Session Replay 录屏、Vercel 日志导出(需 Pro)、Cloudflare Web Analytics beacon、Cloudflare 精细告警(需 Pro)。
