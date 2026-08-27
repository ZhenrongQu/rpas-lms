# QA 文档索引

| 项 | 内容 |
|---|---|
| 建立日期 | 2026-08-24 |
| 基准版本 | 分支 `qa-focus`，提交 `792af2b` |
| 配套需求文档 | [`docs/product/PRD.md`](../product/PRD.md) |

---

## 这套文档是什么

一套完整的 QA 工作资产。它的存在解决三个问题：

1. **测试不可重复** —— 没有用例集时，每次测试的覆盖范围都取决于当时的记忆
2. **测试不可交接** —— 隐性知识留在脑子里，别人接手等于从零开始
3. **测试不可度量** —— 说不清"测了多少、覆盖了什么、还差什么"

> **本项目的特殊背景**：代码里有 107 个自动化测试，质量意识在线。但这些属于**开发者测试**——验证"代码是否按我写的那样运行"。
> QA 测试回答的是另一个问题：**产品是否在用户会遭遇的所有情况下正确运行**。这套文档补的是后者。

---

## 文件索引

### 先读这两份

| 文档 | 什么时候读 |
|---|---|
| [`test-plan.md`](./test-plan.md) | **入口文档**。测什么、怎么测、测到什么程度算完；含风险评估与进入/退出准则 |
| [`defect-standard.md`](./defect-standard.md) | 提缺陷之前必读。Severity/Priority 判定标准、缺陷单模板、棘手场景处理 |

### 执行时用

| 文档 | 用途 |
|---|---|
| [`permission-matrix.md`](./permission-matrix.md) | 5 种身份 × 全部功能的权限矩阵与验证状态 |
| [`test-cases/exam.md`](./test-cases/exam.md) | 考试引擎用例集（用例级） |
| [`test-cases/payments.md`](./test-cases/payments.md) | 支付与权益用例集（用例级） |
| [`test-cases/flight-review.md`](./test-cases/flight-review.md) | **Flight Review 与审查券**用例集（52 条，用例级）—— 覆盖 U13 消耗品模型改造 |
| [`test-cases/other-modules.md`](./test-cases/other-modules.md) | 其余功能域的测试思路与风险分级 |
| [`exploratory-charters.md`](./exploratory-charters.md) | 5 份探索式测试章程（SBTM） |

### 发布时用

| 文档 | 用途 |
|---|---|
| [`regression-checklist.md`](./regression-checklist.md) | 回归清单 + **变更影响映射表**（改 X 要回归 Y） |
| [`release-checklist.md`](./release-checklist.md) | 发布准入清单 + Go/No-Go 陈述模板 |

### 规划时用

| 文档 | 用途 |
|---|---|
| [`automation-roadmap.md`](./automation-roadmap.md) | 自动化现状（金字塔形状）与分阶段路线 |

---

## 按场景查

| 我要做什么 | 看哪份 |
|---|---|
| 我改了 `grade.ts`，该回归什么？ | [`regression-checklist.md`](./regression-checklist.md) §2.1 |
| 我发现了一个问题，怎么定级？ | [`defect-standard.md`](./defect-standard.md) §2–4 |
| 开发说"这不是 bug"，怎么办？ | [`defect-standard.md`](./defect-standard.md) §8.2 |
| 缺陷复现不了，怎么办？ | [`defect-standard.md`](./defect-standard.md) §8.1 |
| 明天要发布，我该检查什么？ | [`release-checklist.md`](./release-checklist.md) |
| 时间不够，该优先测什么？ | [`test-plan.md`](./test-plan.md) §3 风险评估 |
| 我想找出没人发现过的 bug | [`exploratory-charters.md`](./exploratory-charters.md) |
| 新加了一个功能，要补什么？ | [`permission-matrix.md`](./permission-matrix.md) §5 |
| 接下来该投入哪项自动化？ | [`automation-roadmap.md`](./automation-roadmap.md) §5 |

---

## 当前的关键结论

### 已确认的缺陷 —— 均已修复（2026-08-25 / 08-26）

| ID | 问题 | Severity | 状态 |
|---|---|:---:|:---:|
| **DEF-001** | `paid_access` 权益**无任何撤销路径** —— 退款后课程权限无法收回，只能手工改数据库 | **S1** | ✅ 已修复 |
| **DEF-002** | 服务端不校验考试超时，**客户端未运行时超时会话永久悬挂**，作答事实上丢失 | S2 | ✅ 已修复 |
| **DEF-003** | 题池不足时**静默生成题量不完整的试卷**，且及格线按实际题量计算 → 给出虚假的通过信号 | S2 | ✅ 已修复 |
| **DEF-004** | Resend 拒绝的邮件被记为**发送成功** —— 预约通知写 `SENT`，`hasFailedNotification` 永不触发，U12 重发入口从未出现；验证码与密码重置同样静默失败 | **S1** | ✅ 已修复 |
| **DEF-004b** | DEF-004 的**下半段**：发信层改成会抛之后，两个 auth 调用方把这句实话又处理错了 —— 注册把「账号已建好 + 邮件被拒」答成 `registration failed` 并回传 provider 原文；忘记密码整条吞掉，**两条链路都没有任何持久记录** | **S1** | ✅ 已修复 |
| **DEF-004c** | 同一个 bug 长在了**它自己的恢复入口**上：`safeSend` 按设计吞掉投递异常（预约不能因邮件失败而回滚），于是两个 resend 端点在被拒时照样回 `ok: true` —— 学员点「重新发送」看到「已发送」 | **S1** | ✅ 已修复 |
| **DEF-005** | ops 脚本默认连 `.env` 指向的库且不打印目标；`.env` 实际指着生产，而两个 Supabase 项目的命名与引用它们的 env 文件完全相反 | **S1** | ✅ 已修复 |

**修复实现**（PRD 第 10 章 U5 / U2 / U1，2026-08-25 落地）：

| ID | 实现 | 关键代码 |
|---|---|---|
| DEF-001 | `revokePaidAccessEntitlement` —— 权益撤销与 `accessTier` 重置**同一 `$transaction`**；管理端 `/coriander/entitlements`；用户端退款申请 + 管理端审核（U5） | `src/lib/payments/entitlements.ts`、`src/lib/payments/refunds.ts` |
| DEF-002 | `ExamService.loadSession` 惰性结算，覆盖全部读路径（含考试历史）；结算幂等靠 `SessionStore.settleIfUnsubmitted` 的**条件写**，`submitted` 与 `result` 原子落库 | `src/lib/exam/service.ts`、`prismaStore.ts` |
| DEF-003 | `createMock` 生成前校验**按等级过滤后**的题池；不足抛 `InsufficientQuestionPoolError` → 路由 409；CMS 题库健康度表 | `src/lib/exam/service.ts`、`src/lib/admin/bankHealth.ts` |

> 相关用例已从「缺陷证据」转为**回归防线**：`service.test.ts` 的并发结算用例做过变异测试（退回「先抢占后写入」的两步实现即转红）。

**DEF-004 / DEF-005 的修复**（2026-08-26 落地）：

| ID | 实现 | 关键代码 |
|---|---|---|
| DEF-004 | Resend SDK 用 `{ data, error }` **resolve** 而非 reject，三处调用点各自把「没抛」读成「已投递」。统一收敛到 `deliverViaResend`：`error` 抛，没有 message id 也抛（provider 的 id 是「被接受」的唯一正面证据） | `src/lib/email/resend.ts` |
| DEF-004b | 抽出共享的 `recordNotificationAttempt` —— Flight Review 原本独享的 `NotificationLog` 记录，auth 两条链路现在同样写入。注册：投递失败与注册失败分离，返回 201 + `codeDelivered: false`，前端提示走既有的「重新发送」；忘记密码：保持统一 200（不能泄露账号是否存在），但失败落库不再只有一行 console | `src/lib/email/log.ts`、`app/api/auth/register/route.ts`、`app/api/auth/password/forgot/route.ts` |
| DEF-004c | `safeSend` 返回是否投递成功，`notifyBookingChange` 上抛**学员那一封**的结果（管理员抄送失败不影响告诉学员什么），`resendBookingConfirmation` 从 boolean 改为 `sent` / `delivery_failed` / `no_address` 三态；两个端点被拒时回 502，前端给出专门文案。预约链路仍然忽略该结果 —— 邮件失败不能回滚已成交的预约 | `src/lib/flightReview/notifications.ts`、两个 `resend/route.ts` |
| DEF-005 | `guardDbWrite()` —— 每个 ops 脚本第一句：打印 `→ target:`，非本机目标默认拒绝。`.env` 改本地库，生产串移入无人加载的 `.secrets/prod-db.env` | `src/lib/ops/dbTarget.ts` |

**为什么这两个漏测**（复盘）：

| | DEF-004 | DEF-005 |
|---|---|---|
| 漏测原因 | 单测都 mock 掉了发信；**"发送成功"这个断言从来没有对照过 provider 的真实响应形状**。DEF-004b 更进一层：只修了发信层，没有回头问「调用方拿到这个异常之后做了什么」 | 根本不在测试的射程内 —— "命令打到哪个库"属于环境配置，测试库里永远是对的（同 [`automation-roadmap.md`](./automation-roadmap.md) §1.5 那一类） |
| 发现方式 | 拿生产构建 + 故意无效的 API key 实跑一遍，读通知日志 | 事后核对 Supabase 控制台 |
| 防复发 | `resend.test.ts` 的**入口点断言**：全 `src/`+`app/` 里只有 `src/lib/email/resend.ts` 可以 import `resend` 包。已做变异验证 —— 任意新增一处直连 import 立即转红并点名文件 | `guardDbWrite()` 已覆盖全部 13 个会写库的 ops 脚本（含 `pnpm eval:assistant` —— 它会 create/delete `Customer` 行，此前完全无守卫）。`verify-schema` 只读，按设计不拒绝远端；`scripts/agents/*` 早已自带本机限定检查。其中 4 个是本地未跟踪文件，**新克隆上不存在这层保护** |

> **两条共同的教训**：DEF-004 是「三处调用点各自独立犯了同一个错」—— 修好三处不等于修好这一类，所以防线建在**入口点唯一性**上而不是调用点上。而 DEF-004b 说明**「让它抛出来」只是修了一半**：异常改变了每个调用方的控制流，不跟着走一遍就会把静默失败换成另一种错误答案。DEF-004c 则是这条链上的第三段 —— **恢复入口本身也是一个调用方**，而且是最不能撒谎的那个：U12 的整套设计都建立在「学员点了重发就能知道结果」上。三段合起来说明一件事：一个「把失败当成功」的缺陷，边界不在出错的那行代码，而在**这条信息一路传到用户眼前的每一跳**。DEF-005 是「当时在猜」—— 关于目标库的判断只能来自控制台或 `→ target:` 那一行。

### 最大的覆盖缺口

| 缺口 | 说明 |
|---|---|
| **E2E 测试为 0** | 35 个页面、58 个 API，整机从未通电试飞 |
| **CI 不跑 `typecheck` / `build`** | 类型错误和构建失败可以合入 `main` |
| **`FR-Only` 身份零覆盖** | `accessTier=FREE` 但持有权益，是权限逻辑最易出错的组合 |
| **题池分层仅有单元测试** | 函数被验证正确，但没人验证过真实试卷的题目难度 |
| **限流阈值全部未验证** | 检查点 120、AI 助手 20、登录 8/5，边界均无覆盖 |

### 一个容易被误读的数字

代码库有 **107 个测试文件**，但其中 **34 个（32%）测试的是内部工具**（`remediation` 自动修复 agent），与用户功能无关。

**评估产品质量覆盖时应该用 73，不是 107。**

---

## 与 PRD 的关系

两套文档是**镜像关系**，互相引用：

| PRD 定义 | QA 验证 |
|---|---|
| §5 功能需求（`R-XXX-NN`） | 用例集中每条用例回指需求编号 |
| §7 权限矩阵（应该如何） | [`permission-matrix.md`](./permission-matrix.md)（是否如此 + 验证状态） |
| §10 未定事项（U1–U12） | 用例断言**当前实际行为**并标 `⚠️待决策` |

### 对未定义行为的处理原则

> **未定义不等于可以不测。**
>
> 对 PRD 未定义的行为，用例断言**当前实际行为**，并标注 `⚠️待决策`。
>
> 这样做有两个作用：**锁定现状**（确保它不会在无人察觉时改变）、**保留标记**（PO 做出决策后，用例会被同步更新而不是被遗忘）。

---

## 维护约定

| 时机 | 动作 |
|---|---|
| 新增功能 | 先在权限矩阵加一行 → 填不出 5 种身份的期望行为就说明需求没定义清楚 |
| 修改业务规则 | 同步更新 PRD + 相关用例 + 回归映射表 |
| 发现新的依赖关系 | 更新 [`regression-checklist.md`](./regression-checklist.md) §2 |
| 缺陷修复后 | **回流**：补自动化用例 + 更新回归清单 + 复盘为何漏测 |
| 发现文档与代码不符 | **以代码为准**，修订文档，并思考为什么会漂移 |

### 编号规则

| 类型 | 格式 | 示例 |
|---|---|---|
| 需求 | `R-<域>-<序号>` | `R-EXM-03` |
| 用例 | `TC-<域>-<序号>` | `TC-EXM-21` |
| 缺陷 | `DEF-<序号>` | `DEF-001` |
| 未定事项 | `U<序号>` | `U5` |
| 风险 | `RSK-<序号>` | `RSK-02` |

---

## 关于文档的版本管理

⚠️ 项目 `.gitignore` 第 40 行忽略了全部 `*.md`（仅根 `README.md` / `README.zh.md` / `CLAUDE.md` 例外）。

**因此本目录下的文档默认不会进入 git。**这符合项目既有惯例（`docs/` 为本地文档）。

若需纳入版本管理，在 `.gitignore` 中追加：

```gitignore
!/docs/qa/**/*.md
!/docs/product/**/*.md
```

> **建议纳入版本管理。**测试资产的价值来自持续维护与可追溯，脱离版本控制的文档会很快与代码漂移——这正是本项目 README 已经发生的问题（见 PRD §11 文档勘误）。
