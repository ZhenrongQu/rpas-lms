# 安全隐患修复计划 (Security Remediation Plan)

**日期：** 2026-06-17
**范围：** 后端接口安全审查的汇总与修复清单（认证、权限、密码、输入校验、注入、过度防御）
**来源：** 本文件汇总自 5 轮源码审查，全部对照真实代码，标注 file:line。

> 免责声明：本计划基于源码人工+AI 审查，覆盖常见模式，不等于专业渗透测试，也不保证无遗漏。涉及支付与个人信息的系统，上线前建议再由专业安全团队复核。

---

## 图例

- **严重度**：🔴 高 / 🟠 中 / 🟡 低
- **工作量**：⏱️ 今天可做（≤1h，小且独立） / 📅 本周排期 / 🗓️ 后续功能项
- **状态**：☐ 未开始 / ◐ 进行中 / ☑ 完成

---

## 汇总表

| ID | 隐患 | 严重度 | 工作量 | 位置 | 状态 |
|---|---|---|---|---|---|
| SEC-01 | 邮件 HTML 注入（显示名未转义） | 🟠 | ⏱️ | `src/lib/flightReview/notifications.ts` | ☑ |
| SEC-02 | 建考卷默认 `accessTier="PAID"`（失败时开最大权限） | 🟠 | ⏱️ | `src/lib/exam/service.ts:37` | ☑ |
| SEC-03 | `progress/lesson` 写入未校验 lessonId 是否存在 | 🟡 | ⏱️ | `app/api/progress/lesson/route.ts` | ☑ |
| SEC-04 | `checkpoint/check` 是全考试题库答案的公开预言机 | 🔴 | ⏱️临时 + 📅彻底 | `app/api/checkpoint/*` / `CheckpointQuestion` 表 | ☑ 彻底修复 |
| SEC-05 | 测试后门 `x-test-user-id` 依赖 NODE_ENV | 🟠 | ⏱️ 验证+加固 | `app/api/exam/sessionAuth.ts:5` | ☑ 已加固* |
| SEC-06 | `create-customer.ts` 绕过邮箱验证并可设 PAID | 🟠 | ⏱️ 验证 | `scripts/create-customer.ts` | ☑ |
| SEC-07 | 后台页面（ADMIN_BASE UI）鉴权未确认 | 🟠 | ⏱️ 验证 | `app/coriander/layout.tsx` | ☑ 已确认 |
| SEC-08 | 密码 min(8) 只在路由层；无最大长度 | 🟡 | ⏱️ | `src/lib/auth/localAccount.ts` `register/route.ts` | ☑ |
| SEC-09 | 后台筛选参数未做枚举校验（正确性） | 🟡 | ⏱️ | `app/api/coriander/{lessons,questions}/route.ts` | ☑ |
| SEC-10 | **无登录失败限制 / 账号锁定** | 🔴 | 📅 | 全局（登录+管理员登录） | ☐ |
| SEC-11 | 无发码/注册/下单接口限流 | 🟠 | 📅 | 全局 | ☐ |
| SEC-12 | 后台 `coriander/*` 无路由级测试 | 🟠 | 📅 | `app/api/coriander/**` | ☐ |
| SEC-13 | 无密码复杂度 / 弱密码 / 泄露库拦截 | 🟠 | 📅 | 注册路由 | ☐ |
| SEC-14 | 无「修改密码」流程 | 🟠 | 🗓️ | 不存在 | ☐ |
| SEC-15 | 无「忘记/重置密码」流程 | 🔴 | 🗓️ | 不存在 | ☐ |
| SEC-16 | 管理员无 MFA，密码规则与普通用户相同 | 🟠 | 🗓️ | 管理员登录 | ☐ |
| SEC-17 | MDX 用正则黑名单清洗（建议换白名单 sanitizer） | 🟡 | 🗓️ | `src/lib/admin/mdxValidation.ts` | ☐ |

---

## 一、今天就做 ⏱️（小、独立、可立即验证）

### SEC-01 — 邮件 HTML 注入
- **真实风险**：学员显示名 `displayName`（用户可控）被原样拼进邮件 HTML 且不转义，落到**管理员/考官收件箱**，可注入钓鱼链接、图片、伪造内容（非脚本执行，但是真实的内容/钓鱼注入）。
- **位置**：`src/lib/flightReview/notifications.ts` 第 67、80、103、113 行。
- **修复**：加 `escapeHtml`，**先转义、再把换行转 `<br>`**（顺序不能反）。
  ```ts
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // 4 处：
  html: `<p>${escapeHtml(studentBody).replace(/\n/g, "<br>")}</p>`,
  ```
- **验收**：新增测试——displayName 设为 `<img src=x onerror=alert(1)>`，断言邮件 `html` 中出现 `&lt;img`，不出现裸 `<img`。`text` 字段保持原样。

### SEC-02 — 建考卷的「失败开最大权限」默认
- **真实风险**：`createMock(..., accessTier: AccessTier = "PAID")` 默认 PAID。任何调用方漏传 tier 就给全题库。当前路由都显式传了，但默认值方向错误（应最小权限）。
- **位置**：`src/lib/exam/service.ts:37`。
- **修复**：默认改为最小权限或设为必填。
  ```ts
  accessTier: AccessTier = "GUEST",   // 或者去掉默认值，强制调用方显式传
  ```
- **验收**：测试「不传 tier → 抽到的不是 PAID 题池」。

### SEC-03 — progress/lesson 写入脏 lessonId
- **真实风险**：`markLessonComplete(userId, lessonId)` 直接写入，前端可塞任意字符串当 lessonId（绑自己，越不了权，但写脏数据/制造不存在的进度）。
- **位置**：`app/api/progress/lesson/route.ts`。
- **修复**：写库前用课程目录校验 lessonId 是否为真实课程，否则返回 404。
- **验收**：测试「不存在的 lessonId → 404，不落库」。

### SEC-04 — checkpoint/check 是「全考试题库答案的公开预言机」🔴
- **产品意图（已澄清，2026-06-17）**：checkpoint **将来用独立的 checkpoint 题库**，与考试题库分开。等独立题库建好后，checkpoint 公开返回答案是可接受的练习内容。
- **现状（真实漏洞）**：独立题库**尚未建立**。`checkpoint/check` → `findActiveQuestion(id)` 查的是**考试题库** `basicQuestionBank`/`advancedQuestionBank`（`loadBank.ts:24-36`），且**不限定** id 必须是某课程引用的 checkpoint。题目 id 形如 `air-law-0001`（regex `^[a-z-]+-\d{4}$`，**可枚举**）。
  → 任何人**无需登录**就能 POST 枚举的 id，拿到**整个考试题库**的 `correctOptionIds` + 解析。考试引擎「交卷前不给答案、选项乱序」的保护被完全绕过，**动摇服务端判分这一核心功能**——故升为 🔴。
- **彻底修复（📅 排期，提到高优先）**：建独立 `CheckpointQuestionBank`（或给题加 `purpose: EXAM|CHECKPOINT` 标记并把 checkpoint 题**排除出考试抽题池**）；`checkpoint/[id]`、`checkpoint/check` 与 MDX 的 `checkQuestionIds`（`mdxValidation.ts`）全部改指向 checkpoint 题库。属数据模型 + 迁移 + 内容迁移，需排期。
- **临时缓解（⏱️ 今天，需你拍板二选一）**：
  - **方案 A（最稳，推荐）**：独立题库上线前，`checkpoint/check` **暂不返回答案**（或整段下线该接口），课程里的 checkpoint 暂用别的占位。最彻底地堵住泄题。
  - **方案 B（保留练习功能，但弱）**：`checkpoint/check` 加登录校验，仅返回**当前已发布课程 `<Checkpoint>` 实际引用过**的 questionId 的答案，拒绝任意 id。能挡住「枚举整库」，但登录用户仍能拿到那批被引用的考试题答案——只是缓解，不是根治。
- **验收**：临时方案落地后——「未登录 / POST 一个未被任何课程引用的考试题 id → 不返回答案」。彻底修复后——「checkpoint 端点查不到任何考试题库的题」。

### SEC-05 — 测试后门依赖 NODE_ENV
- **真实风险**：`NODE_ENV==="test"` 时 `x-test-user-id` 头可冒充任意用户。生产若 NODE_ENV 配错即灾难。
- **位置**：`app/api/exam/sessionAuth.ts:5-14`。
- **修复**：
  1. **立即验证**生产环境 `NODE_ENV=production`（查 Vercel 环境变量）。
  2. **加固**：把后门再加一道独立开关，例如仅当 `process.env.ALLOW_TEST_AUTH === "1"` 才生效，且该变量永不在生产设置。
- **验收**：生产环境变量截图/记录；加固后测试仍能跑（测试环境设该开关）。

### SEC-06 — create-customer 脚本绕过邮箱验证
- **真实风险**：`scripts/create-customer.ts` 能造一个已验证邮箱、可设 PAID 的账号，绕过正常验证流程。dev 工具，但若生产可执行且能连库即可凭空造号/造付费。
- **修复/验证**：确认生产部署**不打包/不可执行** scripts，且 `DATABASE_URL` 访问受控。在脚本头部加生产环境护栏（如 `NODE_ENV==="production"` 直接报错退出）。
- **验收**：脚本在 production 下运行即拒绝。

### SEC-07 — 后台页面鉴权确认
- **真实风险**：`middleware.ts` 对 `ADMIN_BASE` 路径直接放行（只跳过 i18n），后台**页面**（非 API）是否各自鉴权未验证。API 已确认用 `requireAdminApi`。
- **修复/验证**：逐个确认 admin 页面（server component / layout）调用了 `getCurrentAdmin()` 或等价守卫；缺失则在 admin layout 统一加。
- **验收**：用普通用户/未登录访问后台页面 → 重定向或 404。

### SEC-08 — 密码长度校验下沉 + 上限
- **真实风险**：min(8) 只在注册路由的 zod；`registerLocalAccount` 服务层不校验（目前只有该路由调它）；无最大长度 → bcrypt 超 72 字节静默截断。
- **位置**：`src/lib/auth/localAccount.ts:90`、`src/lib/auth/password.ts`。
- **修复**：在 `registerLocalAccount`/`hashPassword` 入口加 `8 ≤ length ≤ 72` 校验。
- **验收**：服务层单测覆盖过短/过长。

### SEC-09 — 后台筛选参数枚举校验（正确性，非安全）
- **位置**：`app/api/coriander/lessons/route.ts:18-21`、`questions/route.ts:16-32`。
- **修复**：`moduleId`/`access`/`level`/`difficulty` 用枚举/数字校验，非法值返回 400 而不是静默查空。（Prisma 参数化，无注入；这是体验/正确性。）

---

## 二、本周排期 📅（需要一点基础设施或较多测试，做不完同一天）

### SEC-10 — 登录失败限制 / 账号锁定 🔴（最高优先）
- **真实风险**：客户与管理员密码登录**无任何失败次数限制/锁定/退避**，唯一刹车是 bcrypt 慢。配合无复杂度+无弱密码拦截，弱密码账号易被在线爆破。
- **方案**：按「账号 + IP」记失败次数，阈值后锁定/退避。
- **为何非当天**：Vercel 无状态多实例，**内存计数不可靠**，需共享存储（Vercel KV / Upstash Redis，或用现有 DB 表）。需先选型。
- **验收**：连续 N 次错误密码后第 N+1 次被拒（429/锁定），正确密码在窗口外恢复。

### SEC-11 — 接口限流
- 发验证码、注册、下单缺少「按 IP/账号每窗口次数上限」。复用 SEC-10 的共享存储一并做。验证码本身有「单条 5 次/10 分钟」（`verificationCode.ts:6-7`），但缺「同一目标每天发几条」上限，可被刷邮件/短信费用。

### SEC-12 — 后台 coriander/* 路由级测试
- **真实风险**：后台权限只有 `adminGuard.test.ts` 在**单元层**证明；**没有端到端测试**证明每条路由确实接上了守卫。后台能改题库正确答案、改 FREE/PAID 课程、发免费权益，最该补。
- **方案**：为每条 `coriander/*` 路由加：非管理员→404、坏 body→422、管理员→2xx。
- **验收**：`pnpm test` 覆盖全部后台路由的鉴权与校验。

### SEC-13 — 弱密码/复杂度拦截
- 接入 zxcvbn 或常见弱密码黑名单 + 复杂度下限；与 SEC-08 一起在注册入口做。

### SEC-04（彻底修复部分）— 独立 checkpoint 题库
- 见上方 SEC-04。建 `CheckpointQuestionBank` 并把 checkpoint 题排除出考试抽题池，端点与 MDX 校验改指向它。**优先级高**（在临时缓解落地后尽快做），因为临时方案只是堵口、不是根治。

---

## 三、后续功能项 🗓️（属于功能开发，需排期，非当天）

- **SEC-14 修改密码流程**：登录后无法改密。
- **SEC-15 忘记/重置密码流程** 🔴：用户忘记密码**无法自助找回**，只能管理员跑脚本重置——既是功能缺口也是安全缺口。建议复用现有验证码/邮件设施（`verificationCode.ts`）做一次性、短时效、单次有效的重置令牌。
- **SEC-16 管理员 MFA**：最高权限账号目前只有「用户名/邮箱 + 8 位密码」，无二次验证、无独立锁定。建议至少给管理员加 MFA 或独立的失败锁定 + IP 白名单。
- **SEC-17 MDX 白名单 sanitizer**：当前为正则黑名单（`mdxValidation.ts`），管理员专用风险低，但建议换 rehype-sanitize 白名单更稳。

---

## 四、明确「不需要改」的（避免过度防御）

为防后续误把这些当 bug «修»，记录在案：

- `adminGuard` 先看令牌 `isAdmin` 再查 `Admin` 表——**不是冗余**，解决「管理员被删/降权后旧令牌仍有效」的真实风险，保留。
- `submit` 路由里 `submitted === null → 404`——`requireExamOwner` 已证明 session 存在且无删除路径，该分支几乎不触发，但只是一行 TS null 收尾，**留着**（删了反而要加 `!` 断言）。
- 注册时 `assertAliasAvailable` 查重——是**体验层**友好错误（DB 唯一约束才是权威），有 TOCTOU，**别当并发安全保证，也别为它加锁**。
- `auth.ts` 里对 NextAuth credentials 的 `typeof === "string"` 检查——creds 是 `unknown`，**必须有**，不是过度防御。
- 全仓无裸 SQL、无命令执行、无路径拼接、无 `dangerouslySetInnerHTML`——注入面已干净，**不要新增手写转义**（邮件那处除外，见 SEC-01）。

---

## 今日验收清单（勾选即完成）

- [x] SEC-01 邮件转义 + 测试（`notifications.test.ts` 2 项通过）
- [x] SEC-02 createMock 默认改 `GUEST` + 测试（含「漏传 tier→10 题 taster」证明）
- [x] SEC-03 progress/lesson 校验 lessonId + 测试（404 不写库；新增 4 项路由测试）
- [x] SEC-04 方案 A：`checkpoint/check` 下线为 410（不再返回答案）+ 测试改为断言 410；「独立 checkpoint 题库」已排入 📅（SEC-04 彻底修复）
- [x] SEC-05 测试后门加 `ALLOW_TEST_AUTH` 双重护栏（NODE_ENV=test **且** flag=1）；⚠️ 生产 `NODE_ENV=production` 仍需人工在部署平台确认
- [x] SEC-06 create-customer 加 `NODE_ENV=production` 拒绝运行护栏
- [x] SEC-07 后台页面鉴权已确认（`coriander/layout.tsx` 对非管理员只渲染登录、不渲染 children）
- [x] SEC-08 密码长度下沉到 `registerLocalAccount`（8 字符 ≤ x ≤ 72 字节）+ 路由 zod `max(72)` + 测试
- [x] SEC-09 后台 questions/lessons GET 的 moduleId/difficulty/access 枚举校验
- [x] 运行 `pnpm test && pnpm typecheck && pnpm build` 全绿（45 文件 / 201 测试 + build 通过）

## 实施进展 (2026-06-17)

**已完成（SEC-01 / SEC-02 / SEC-03 / SEC-04 临时）**

- SEC-03：`progress/lesson` 写库前用 `lessonExists()`（`progress.ts`）校验 lessonId 真实存在，不存在返回 404 且不写库——避免原本 progress→lesson 外键抛未捕获 500。新增 `route.test.ts`（401/400/404/200 共 4 项）。
- SEC-05：`sessionAuth.ts` 的 `x-test-user-id` 冒充后门改为「NODE_ENV=test **且** `ALLOW_TEST_AUTH=1`」双条件，`ALLOW_TEST_AUTH` 仅在 `vitest.config.ts` 设置。即使生产 NODE_ENV 误配为 test，缺 flag 也无法启用。⚠️ 仍建议在部署平台确认生产 `NODE_ENV=production`（现在是防御纵深，非唯一防线）。
- SEC-06：`scripts/create-customer.ts` 开头加 `NODE_ENV=production` 即抛错退出（该脚本会绕过邮箱验证、可设 PAID，纯 dev 工具）。`create-admin.ts` 不加此护栏——它需要在生产创建首个管理员。
- SEC-07：确认 `app/coriander/layout.tsx` 对非管理员只渲染 `<AdminLogin/>`、永不渲染 `{children}`，所有后台页面输出被拦在服务端；API 另有 `requireAdminApi`。**未加每页守卫**（会是冗余过度防御）。残留小项：页面数据查询可能在服务端执行但输出不外发，无泄漏。
- SEC-08：`registerLocalAccount` 入口加 `8 字符 ≤ 密码 ≤ 72 字节`（上限对齐 bcrypt 截断），注册路由 zod 加 `max(72)`。新增 `localAccount.test.ts` 用例（过短/过长均抛 `invalid_password`）。
- SEC-09：`coriander/questions` 与 `coriander/lessons` 的 GET 把 `moduleId` 限定 `MODULE_IDS`、`difficulty` 限定 `^[0-3]$`、`access` 限定 `FREE|PAID`，非法值视为「不筛选」而非生成 `NaN` 等无效过滤（Prisma 本就参数化，这是正确性收紧）。

- SEC-01：`notifications.ts` 加 `escapeHtml`，4 处邮件 HTML 先转义再换行；新增 `notifications.test.ts` 证明恶意显示名被转义（学员邮件+管理员邮件）。
- SEC-02：`service.ts` 建考卷默认 `accessTier` 由 `PAID` 改为 `GUEST`（失败走最小权限）；`service.test.ts` 受影响的 7 处用例显式传 `PAID` 保持原意，新增「漏传 tier → 10 题访客 taster」用例。
- SEC-04（方案 A）：`checkpoint/check` 整段下线为 `410 checkpoint check disabled`，不再读考试题库、不再返回任何答案；`checkpoint.test.ts` 的 POST 用例改为断言 410 且响应体不含 `correctOptionIds`/`explanation`。`checkpoint/[id]`（GET，仅返回无答案的题面）暂保留，彻底修复时随独立题库一并迁移。

**SEC-04 彻底修复（独立 checkpoint 题库 + CMS，2026-06-17）**
- 新增 `CheckpointQuestion`/`CheckpointQuestionOption` 表，与考试题库物理隔离；`checkpoint/[id]`、`checkpoint/check`（已恢复）改读新表，考试题 id 在此一律 404。
- 后台 CMS：`/api/coriander/checkpoints`(+`[id]`) CRUD（`requireAdminApi`）+ `/coriander/checkpoints` 列表/新建/编辑页，按 course→module→lesson 投送，渲染在章节底部。
- 内联 `<Checkpoint>` MDX 标签**完全移除**（`mdxValidation` 去掉相关校验，并把 `<Checkpoint>` 列为未知组件拒绝）；课程底部由 `LessonCheckpoints` 渲染。
- 迁移脚本 `scripts/migrate-checkpoints.ts`（复制被引用的考试题为 `cp-` 题、剥离内联标签）+ `seed-content.ts` 占位 checkpoint。
- 测试：`checkpoint.test.ts` 证明「考试题 id → 404、cp 题正常判分」；新增 `coriander/checkpoints/route.test.ts`（非管理员 404 / 坏 body 422 / CRUD 2xx）；`mdxValidation.test.ts` 更新。
- ⚠️ 部署后需运行一次 `pnpm exec tsx scripts/migrate-checkpoints.ts`（会改写 dev/prod 库的课程正文 + `content/**.mdx` 源文件），把历史内联 checkpoint 迁移成关联。

**验证状态（已全部补跑，2026-06-17）**
- `pnpm typecheck`：✅ 通过。
- `pnpm test`：✅ **46 个测试文件 / 199 项全通过**（含 SEC-04 独立题库「考试题 id→404」、checkpoint CMS CRUD、邮件转义、GUEST 默认、progress 404、密码长度等证明）。
- `pnpm typecheck` / `pnpm build`：✅ 通过。
- 已完成（截至本次）：SEC-01 / 02 / 03 / 04(临时+**彻底**) / 05 / 06 / 07 / 08 / 09。剩余：SEC-10~17（登录失败锁定、限流、其余后台路由测试、弱密码拦截、改密/重置、管理员 MFA 等）。
- 测试库：本地用 Docker 容器 `rpas-test-pg`（Postgres 16，:5433）跑起后验证，容器保留供后续测试。
