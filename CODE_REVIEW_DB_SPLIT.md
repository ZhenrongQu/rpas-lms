# Code Review — Admin/Customer + Question/Lesson Split

**Commit reviewed:** `67937c2` — *refactor(db): split users into Admin/Customer and content into Basic/Advanced tables*
**Base:** `main` (8796749) · **Review date:** 2026-06-11
**Verdict:** ❌ 暂不可合并(需修复)。`typecheck` 干净,测试 149/149 通过,但有 2 个 Critical 阻断 + 安全测试缺口。

修复顺序建议:**#1 + #4 一起做(同一个 migration)→ #2 → #3 → Minor**。

---
> **进度 (2026-06-12):** 全部代码项已完成并验证(typecheck 干净,**152 测试全过**)。
> ✅ **Critical:** #1 migration 重写 + #4 RLS(一次性 Postgres `migrate reset` 验证:16 表、RLS 16/16、`ensure_rls` 触发器)、#2 id 冲突(加 bank 前缀 + TDD)。
> ✅ **测试:** #3 凭证层 + session 层(`adminAccount.test.ts` 5 + `adminGuard.test.ts` 5)。
> ✅ **清理:** #6 / O1 / O5 / O6;以及**完整退役文件 bank** —— 删 `question-bank.json`(215KB)+ `schema.ts` + 文件 loader,题目侧彻底移除 `BOTH`(**O2 / O3 / O4 / #5 一并解决**),4 个 exam 单测改用内存 fixture(仍 fast、不连 DB)。
> ✅ **dev 已应用并验证**(2026-06-12);**prod 按你的决定推迟到上线时做**(命令见 #1)。
> ⚠️ #1 重写了已提交的两个 migration 文件(squash-in-place),`git diff` 会显示。
---

---

## ✅ 已确认没问题(无需动)
- admin/customer 权限边界设计扎实:`getCurrentAdmin` 同时要求 `session.user.isAdmin === true` 且 `Admin` 表有真实记录;`isAdmin` 只在 admin provider 分支被设 `true`,在签名 JWT 里不可伪造 → customer 无法提权。
- 每个 `app/api/coriander/*` 路由都有 `requireAdminApi()`,CMS 页面由 `app/coriander/layout.tsx` gate;返回 404 不暴露后台。
- 考试评分用创建时的题目快照,不实时查表 → 对拆分免疫,即使 #2 也不会污染已评分考试。
- admin 标识符归一化(`trim().toLowerCase()`)与 `scripts/create-admin.ts` 一致。
- `scripts/seed-test-fixtures.ts` 健全(确定性、仅强制 reset、题量足够跑满 35 题考试)。

---

## 🔴 Critical(必须修,合并阻断)

### [x] #1 — schema 大改没有对应的 Prisma migration ✅ 已重写并验证
> ✅ 重写 `20260610224417_init`(按新 schema:16 表 / 33 索引 / 10 FK,离线 `migrate diff` 生成)。已重置=可重置,**未写 data-migration**(按你的决策)。在一次性 Postgres 上 `migrate reset` 全程验证通过。
> ✅ **dev 已应用并在真实 Supabase 验证**(2026-06-12):`migrate reset` + `seed:content` + 重建 `devadmin`;16 表、RLS 16/16、`ensure_rls` 在位、题目 id 已前缀化(`basic-air-law-0001` / `adv-air-law-0001`)。
> ⏳ **prod = 推迟到上线时做**(你的决定)。注意:现有 prod 项目 `_prisma_migrations` 记的是旧条目,正确做法是 `migrate reset`(**不是** `deploy` —— squash-in-place 改了 checksum,`deploy` 会因 checksum 不符而拒绝)。上线时用 `.env` 注释里的 PROD 串:
> ```
> DATABASE_URL=<PROD> DIRECT_URL=<PROD> npx prisma migrate reset --force --skip-seed && \
> DATABASE_URL=<PROD> DIRECT_URL=<PROD> pnpm seed:content
> ```
> 再用 `ADMIN_USERNAME/PASSWORD/EMAIL` 跑 `scripts/create-admin.ts` 建 prod 管理员(密码用 prod 专属、别复用 dev)。
**位置:** `prisma/migrations/`(只有 `_init` + RLS,commit `67937c2` 没碰任何 migration 文件)
**问题:** `_init` migration 建的还是旧表 `User`/`Question`/`Lesson`;schema.prisma 现在定义的是 `Admin`/`Customer`/`BasicQuestionBank`/`AdvancedQuestionBank`/`BasicLesson`/`AdvancedLesson`。但 `ENVIRONMENTS.md` 写的部署流程是 `prisma migrate deploy`。
**后果:** 对全新 prod 库跑 `migrate deploy` 会建出**旧表**,app 查 `prisma.admin` / `prisma.customer` / `prisma.basicLesson` 直接运行时崩溃("relation does not exist")。dev 库目前大概是用 `db push` 偷偷对上的,造成 `migrate deploy` 复现不了的 drift。
**修法:**
1. 先确认各环境是否已有真实数据(决定要不要写 data-migration)。
2. `prisma migrate dev --name split_admin_customer_and_content`
3. 若有真实数据,补 data-migration:按 role 拆 `User` → `Admin`/`Customer`;按 `certLevel`/`course` 把 `Question`/`Lesson` 路由进 Basic/Advanced(并解决旧的 `BOTH`)。
4. `prisma migrate status` 确认无 drift → 在一次性丢弃库上跑 `migrate deploy` + 冒烟测试。

### [x] #2 — 跨 bank 题目 id 冲突 → checkpoint 答案错误 ✅ 已修(id 加 bank 前缀)
> ✅ 新增 `questionBankPrefix()`(`src/lib/content/types.ts`);id 变为 `basic-…` / `adv-…` 全局唯一。改动:`nextQuestionId`、`seed-content.ts`(题 + 占位课 checkpoint 引用)、`seed-test-fixtures.ts`。新增 `src/lib/admin/questions.test.ts`(2 测试,TDD 先复现冲突再锁定)。`findQuestionById` 与 edit/delete 路由因 id 唯一而天然无歧义。
> 备注:`content/lessons/*.mdx` 与 `question-bank.json` 里的旧式引用未动 —— 它们当前未被导入 DB(dormant);若日后接入内容管线,需同步改成前缀 id。
**位置:** `src/lib/admin/questions.ts:37-48`(`nextQuestionId` 只扫单个 bank)、`src/lib/content/loadBank.ts:68-80`(`findActiveQuestion` basic 优先)
**问题:** 题目 id 是 `${moduleId}-NNNN`,basic / advanced 两个 bank 可生成相同 id(`air-law-0001`)。`findActiveQuestion` basic 优先解析,于是 advanced 课程的 `<Checkpoint questionId="air-law-0001" />` 会拿 **basic** 题的选项和解析来渲染/评分。seed 里就真撞了(`seed-content.ts:50,76`)。
**附带影响:** CMS 编辑/删除(`app/api/coriander/questions/[id]/route.ts` 的 PUT/DELETE 用 basic 优先的 `findQuestionById`,忽略 `level` query 参数)→ 对撞的 advanced 题无法编辑/归档。
**后果:** advanced checkpoint 静默给错答案和解析。
**修法(二选一):**
- 让 id 全局唯一:给 bank 加前缀(`adv-air-law-0001`),或让 `nextQuestionId` 同时扫两个 bank;**或**
- checkpoint 引用上带 bank/level,让 `findActiveQuestion` 能区分。
- 同时修 CMS 编辑/删除路由,使其尊重 `level` 参数。

---

## 🟠 Important(应修)

### [x] #3 — 核心安全不变量零测试覆盖 ✅ 全部完成
> ✅ 凭证层 `src/lib/auth/adminAccount.test.ts`(5 测试):customer 凭证被拒、同名 customer 不能用自己密码冒充 admin、wrong/空密码/空标识符、admin 正常登录(大小写/空格归一)。
> ✅ session 层 `src/lib/auth/adminGuard.test.ts`(5 测试,引入 `vi.mock("auth")` + `vi.hoisted`):无会话/未置 `isAdmin`/**伪造 `isAdmin:true` 的 customer id** 全部被拒;`requireAdminApi` admin→null、非 admin→404 Response。
**问题:** 没有任何测试覆盖 `authorizeAdminPasswordLogin` / `getCurrentAdmin` / `requireAdminApi` / admin provider(无 `*admin*.test.ts`)。"customer 永远无法变 admin" 这个卖点目前未被验证。
**修法:** 补 3 个回归测试 —
1. customer 凭证被 `authorizeAdminPasswordLogin` 拒绝;
2. `isAdmin:false` + 合法 customer id 的会话被 `getCurrentAdmin` 拒绝;
3. 无 admin 会话访问某个 `app/api/coriander/*` 路由返回 404,有会话返回 200。

### [x] #4 — RLS 自动化没覆盖新表 ✅ 已修(随 #1)
> ✅ 把 `20260610231614_enable_rls_automation` 的 backfill 列表从旧表名换成 16 个新表名(`ensure_rls` 函数/触发器不变)。一次性 Postgres 验证:**RLS 16/16 全开**,无遗漏。
**位置:** `prisma/migrations/20260610231614_enable_rls_automation`(只对旧表 `User`/`Question`/`Lesson` 开 RLS)
**问题:** 没有 migration(#1)时,`db push` 建的新表(**包括 `Admin`**)很可能没开 RLS。Supabase 上 RLS-off 的表会暴露给 `anon`/`authenticated` 角色 → deny-by-default 姿态对新表静默失效。
**修法:** 在 #1 的新 migration 里对所有新表显式 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`,并删掉已不存在的旧表 backfill 行。

---

## 🟡 Minor(有空再说,非阻断)

### [x] #5 — 残留的死 `"BOTH"` 分支 ✅ 已完成(题目侧 BOTH 彻底移除,随文件 bank 退役)
`src/lib/content/access.ts:32`、`src/lib/content/generate.ts:14` 还在 `|| q.certLevel === "BOTH"`。DB 题目的 `certLevel` 恒等于 bank level → 运行时是死代码(只有 `question-bank.json` 文件回退里还有 `BOTH`,被测试用)。`dbMappers.ts:98` 和 `schema.prisma:230` 的 `BasicLesson.certLevel` 注释仍提 `"BOTH"` —— 这是**课程标签**层面有意保留的(与 question level 正交),加一句澄清注释避免混淆。

### [x] #6 — 过时注释 ✅ 已修
`src/lib/payments/entitlements.ts:64` 注释还写着 "Update User.accessTier" 和 "SQLite" —— Customer 改名 + 切 Postgres 后已过时,纯文案。

### [ ] #7 — 轻微 N+1
`findActiveQuestion` / `findQuestionById` / `findLessonById` 跨两表各查一次,checkpoint 高频调用。当前可接受,记一笔。

---

## 收尾验证
全部修完后:
- `npm run typecheck` 干净
- `npm test` 全绿(并新增 #3 的 3 个测试)
- `prisma migrate status` 无 drift,新建 migration 在丢弃库上 `migrate deploy` + 冒烟通过

---

# 全项目优化审查(structure / 冗余 / 死代码)

**审查范围:** 整个代码库(非 diff)· **日期:** 2026-06-12 · `typecheck` 干净,无 import 循环。
**结论:** 整体健康。最大可优化点都是 Basic/Advanced 拆分后的遗留。下列按性价比(impact ÷ risk)从高到低排。

> 与上半部分(#1–#7,正确性/安全)是两批独立的事;这里用 `O` 前缀编号。

## 🟢 低风险,建议直接清

### [x] O1 — 删废弃脚本 `scripts/trim-bank.ts` `[safe-delete]` ✅ 已删
一次性的 "300→150 题" 迁移脚本(见文件头 `:2`),只操作已不是运行时来源的文件 bank,**无任何引用**。迁移早已跑完(文件现为 150 题)。git history 即审计记录,可直接删。

### [x] O2 — `content/question-bank.json`(215KB)✅ 已**删除**(整文件退役,优于懒加载)
> 比懒加载更彻底:215KB JSON + 文件 loader + 那条平行的 Zod 校验路径(`schema.ts`)全部移除;4 个 exam 单测改用内存 fixture `src/lib/content/__fixtures__/bank.ts`(保持 fast、不连 DB,无降级)。下方旧分析留作记录。
> **更正:** webpack 对静态 `require("./x.json")` 仍会打包进 bundle,单纯把 `import` 挪进函数体**未必**能把 215KB 移出 server bundle;真要排除得用运行时 `fs.readFileSync`(有 serverless 部署路径风险)。考虑到 O3 决定后文件 bank 可能整体退役,建议**先定 O3,O2 顺势处理**,不要单独硬上。
**位置:** `src/lib/content/loadBank.ts:1` 顶层 `import bankJson from ".../question-bank.json"`。
**问题:** 文件加载器只有测试 + `generate.ts:26` 默认参数用,而 `service.ts:40` 运行时总是传 DB bank → 运行时走不到,却被静态打进 server bundle。
**修法:** 把 import 挪进 `loadQuestionBankFromFile` 函数体(`require`/动态 import)。**加载器本身保留**(测试依赖)。唯一明确的体积/性能赢点。

### [x] O3 — 清死 `"BOTH"` 题目分支 ✅ 已完成(走方案 B:完整退役文件 bank)
> 决策:你选择**完整退役**而非加注释。已删 `question-bank.json` + `schema.ts`,把 `Question.certLevel` 收窄为 `BASIC|ADVANCED`、删 `CertLevel` 别名、移除 `eligible()`/`questionsForAccess()` 的 BOTH 分支、修 `dbMappers` cast。**lesson 侧 BOTH 保留**(正交标签)。下方旧分析留作记录。
> **更正:** `content/question-bank.json` 里有 **130 道 `certLevel:"BOTH"`** 的题,被测试套件(`generate.test.ts`/`access.test.ts` 等)使用。直接删 `BOTH` 分支或收窄题目 `CertLevel` 会让这 130 道题对任何考试都不合格 → **测试会挂**。
> 要真正清掉,得先决定 `question-bank.json` 的去向:(a) 把文件里的 `BOTH` 迁成 BASIC/ADVANCED(改 fixture 语义);(b) 整体退役文件 bank(测试改为用 DB/`seed-test-fixtures`);或 (c) 承认该分支为**文件路径专用**、保留。在做出决定前不要动。

DB 保证每题只属一个 bank(`schema.prisma:133` "There is no BOTH";`:139`/`:166` `@default` 注释),故 `q.certLevel === "BOTH"` 对 DB 题目永远为假:
- `src/lib/exam/access.ts:32`
- `src/lib/exam/generate.ts:14`(+ 过时注释 `:12` "plus BOTH")
- `src/lib/content/dbMappers.ts:98` 过宽的 cast

**最干净做法:** 把**题目的** `CertLevel`(`src/lib/content/types.ts:2`)收窄成 `"BASIC" | "ADVANCED"`,编译器会逼出上面几处。
**⚠️ 注意:** **课程(lesson)的** `certLevel` 要保留 `"BOTH"` —— 那是正交的课程标签(`schema.prisma:230`、`contentSchemas.ts:79`、`LessonEditForm.tsx:108`,均为有意),收窄时务必把题目 cert 类型与课程 cert 类型分开,别误伤。

### [x] O4 — `access.ts` 复用 `eligible()` 去掉重复过滤 `[refactor]` ✅ 已完成
> `questionsForAccess` 现在调用 `generate.ts` 导出的 `eligible()`,重复谓词消除。
`src/lib/exam/access.ts:32` 与 `src/lib/exam/generate.ts:13-15` 是同一段 `filter(q => q.certLevel === level || === "BOTH")`。后者已导出为 `eligible()`,让 `access.ts` 直接调它。**和 O3 一起做**(顺手消掉重复谓词 + 那个 `BOTH`)。

### [x] O5 — 删过时的 "Plan 3" 注释 `[safe-delete]` ✅ 已修
`src/lib/exam/store.ts:25`("Swap for a Prisma-backed store in Plan 3")、`prismaStore.ts:52`("(Plan 3)")。Plan 3 早已完成(PrismaStore 存在并经 `instance.ts` 接线),注释误导。纯文案。

## 🟡 需先确认 / 可选

### [x] O6 — 删除 `scripts/seed-demo.ts` `[structure]` ✅ 已删
一次性 DEMO seed(文件头 `:1`),不在 `package.json`、不在测试里,**无引用**。可能你手动当 fixture 用 —— 删之前自己确认。

### [ ] O7 —(可选)统一 seed 脚本的 Prisma client 用法 `[structure]`
`seed-demo.ts:12`、`create-admin.ts:20` 各自 `new PrismaClient()`,而 `seed-content.ts:11`、`seed-test-fixtures.ts:9` 用共享 `src/lib/db` 的 `prisma`。统一到共享 client。琐碎,有空再说。

## ⛔ 显式留着不动(审查已确认,别改)
- **Basic/Advanced 三元分发**(`catalog.ts`/`progress.ts`/`loadBank.ts`/`questions.ts` + 4 个 coriander 路由):真重复但每处仅 2–4 行、两个 Prisma delegate 类型不同,现在抽象会跟 TS 打架且增加间接层 —— **premature**。仅作为"出现第三个 bank/course 时"的 watch-point。
- `dbMappers.ts:11-44` 用一个结构化类型映射两表 —— 这是**正确的** dedup,保持。
- `src/lib/exam/store.ts` 的 `InMemorySessionStore`(测试 double + 类型来源)、`instance.ts`(6 路由 + 3 页面在用)—— **非死代码**。
- `findActiveQuestion` 的 id 冲突 —— 属上半部分 #2,不在本次优化范围。
