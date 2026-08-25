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

### 已确认的缺陷（编写文档过程中通过代码审查发现，尚未执行任何测试）

| ID | 问题 | Severity |
|---|---|:---:|
| **DEF-001** | `paid_access` 权益**无任何撤销路径** —— 退款后课程权限无法收回，只能手工改数据库 | **S1** |
| **DEF-002** | 服务端不校验考试超时，**客户端未运行时超时会话永久悬挂**，作答事实上丢失 | S2 |
| **DEF-003** | 题池不足时**静默生成题量不完整的试卷**，且及格线按实际题量计算 → 给出虚假的通过信号 | S2 |

> **修复方向已于 2026-08-24 由 PO 决策确定**（PRD 第 10 章 U5 / U2 / U1）：
> - DEF-001 → 补齐 `revokePaidAccessEntitlement`（**必须与 `accessTier` 重置同事务**）+ 新增退款申请审核流程
> - DEF-002 → 服务端惰性结算（读取会话时发现超时未交卷即自动判分落库）
> - DEF-003 → 题池不足时**拒绝创建**，不再静默降级；CMS 增加题库健康度告警
>
> 相关用例已同步更新为「验证决策后的目标行为」。**在修复实现之前，这些用例会失败——这是预期的**，它们此刻的作用是缺陷证据。

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
