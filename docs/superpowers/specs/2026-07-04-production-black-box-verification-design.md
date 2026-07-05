# 生产黑盒验证 — 设计与决策记录 (design)

> 状态:已审阅、待落地。这份 spec 是后续所有改动的锚。
> 日期:2026-07-04。分支:`feat/sdlc-agent`。
> 关联:内核设计见 `docs/auto-fix-remediation/README.md`;交接见 `STATUS.md`;上一里程碑计划 `docs/superpowers/plans/2026-07-01-remediation-repair-verification.md`。

---

## 1. 一句话

当前内核把 **Docker/Vitest 的启发式结果**当成足以发布 `PROPOSED` 的证明,但被测代码与 verifier 同处一个进程安全域,能欺骗它——这是**白盒自证**。本设计把"授权 PROPOSED"重新锚到一个**被测程序无法欺骗的外部黑盒证明**(guest 外的 verifier 持隐藏输入与签名密钥),让实现回到原设计 [README §3](../../auto-fix-remediation/README.md) 的承诺:"模型建议,确定性代码授权"。

**这不是新增功能,是修复一个已经悄悄偏离原设计授权模型的洞。** 确定性状态机内核(lease / CAS / resume / target·policy 冻结)不回退,只在其上补一个不可伪造的证明闸门。

---

## 2. 背景:当前授权模型为何不足(收回旧结论)

内核已能端到端跑通 signal → 复现 → 约束修复 → 确定性验证 → 幂等 Draft-PR 提案。但"确定性验证"这一环名不副实。三个具体缺口(均已核到代码,置信度高):

- **P1 — 生产路径没有黑盒证明闸门。** [verify.ts](../../../src/lib/agents/remediation/verify.ts) 是纯函数,只断言 evidence 的 red-before / green-after / holdout / reproduction-hash / path / size。它**不**验证 attestation、patch digest、verifier/test-bundle digest、VM image identity、runId·target·nonce 绑定、verifier 签名。[driver.ts `VERIFYING→PROPOSING`](../../../src/lib/agents/remediation/driver.ts) 直接放行,所以不可信 `LlmRepairer` + Docker + Vitest 能拿到 `PROPOSED`。

- **P1 — Docker 隔离保护了宿主,但不能证明修复正确。** [dockerCheckRunner.ts](../../../src/lib/agents/remediation/isolated/dockerCheckRunner.ts) 把 repo 挂 ro、`/out` 挂 rw,Vitest 与模型生成代码**同容器同 UID**,事后只对 `result.json` 做结构校验。被测代码因此能写伪造的 `result.json`、`process.exit(0)`、按测试名/输入特判。`parseReport` 能证明"JSON 长得像 Vitest report",不能证明"report 来自可信执行"。这是 **verifier 被被测程序欺骗**,不再是宿主 RCE。

- **P1 — "隐藏 holdout"并不隐藏。** holdout 被注入 worktree 的 `src/` 下;被测代码在同一 Vitest 进程里被 import 执行时,能用裸 `fs` 直接读 holdout 源码(capability 层的 `readAllowlist` 只约束模型的 `ctx.readFile`,拦不住进程内裸 fs)。所以 holdout 目前是"没进 patch",不是"对修复作者与被测代码不可见"。

**因此需收回的旧文档结论**(README/STATUS 中):Docker+Vitest 是 "report-proof";holdout "永不可见";microVM "可选、非必需"。这三条与本决策相反,须在文档中改正(执行顺序第 2 步)。

---

## 3. 核心决策

### 3.1 授权模型:证明必须来自 guest 外部

`PROPOSED` 的授权证据必须来自一个**被测程序无法影响**的判断:验证器(verifier)持有隐藏输入、预期结果与签名密钥,在 **guest 之外**比较实际输出与预期,并签发 attestation。内核只信这份签名证明 + 其绑定字段,不信 guest 内自报的任何 report。

> 关键:把 Vitest 搬进 microVM **仍是白盒自证**——只要测试判断在 guest 内、被测代码能读到预期答案或写结果文件。判断必须在 guest 外。

### 3.2 VerificationProfile:发布权由 run 的显式档位决定,在复现阶段冻结

```ts
type VerificationProfile = "sandbox-fixture" | "production-black-box";
```

- `sandbox-fixture` → 现有确定性 fixture 证据可授权 `PROPOSED`(仅用于机制自测)。
- `production-black-box` → Docker/Vitest 只产生 **heuristic evidence**;没有有效 attestation **必须** `NEEDS_HUMAN`。

**不变式(don't regress):**

1. profile 是 run 的显式属性,**在复现阶段冻结进 target**(与 mainCommit/substrateIdentity 同处不可变 target),resume 只读比对——发布权不能在运行时由 repairer 是否 trusted 推断出来。
2. **`sandbox-fixture` 的 `PROPOSED` 只对确定性 oracle(`FixtureRepairer`)有意义**——它不是对抗性作者、不会作弊。**任何不可信作者(`LlmRepairer`)即使在 `sandbox-fixture` 档也不得 `PROPOSED`**,必须走 `production-black-box` → attestation。否则等于给白盒自证开后门。
3. Firecracker 就绪前,`production-black-box` 档的 run(含 `real-repair-eval` 的 LLM 修复)**终态不得是 `PROPOSED`**,而是 `NEEDS_HUMAN: black-box-verification-unavailable`。`real-repair-eval` 仍可继续评估 LLM 修复质量,但不得产出 `PROPOSED`。

### 3.3 状态机演进:独立的 ATTESTING 阶段(押后到 Firecracker)

```
FIXING → VERIFYING → ATTESTING → PROPOSING → PROPOSED
              │           │           │
              └ heuristic └ 等生产黑盒 └ 幂等发布
                gates       verifier
```

`ATTESTING` 是"等外部 verifier"的持久生命周期:Firecracker 超时、worker 崩溃、verifier 暂不可用时,run **停在 ATTESTING 重试**,不必让 LLM 重修一次。这是**框架级改动**(触及 `types.ts` / `state.ts` / `driver.ts` / `store.ts` + 状态机与恢复测试)。

**YAGNI 顺序判断:** `ATTESTING` 只有在存在**真正的异步外部 verifier**时才有用(mock attestor 是同步的)。因此:
- **立即做(非框架级):** VerificationProfile + fail-closed —— 在现有 `VERIFYING→PROPOSING` 之间加一道 profile 门,`production-black-box` 无有效 attestation → `NEEDS_HUMAN`。立刻堵住"LlmRepairer+Docker 拿 PROPOSED"的洞。
- **押后(框架级):** `ATTESTING` 状态机改动 + Firecracker adapter 同期落地。

---

## 4. Attestation 契约(先定契约,再实现 Firecracker)

### 4.1 请求与证明

```ts
type BlackBoxRequest = {
  version: 1;
  runId: string;
  nonce: string;                 // 每次请求唯一,防重放
  incidentFingerprint: string;
  baseCommit: string;
  patchSha256: string;           // 绑定到确切的 patch
  verifierBundleSha256: string;  // 绑定到确切的隐藏测试/预期集
  vmImageSha256: string;         // 绑定到确切的 guest 镜像
};

type BlackBoxAttestation = {
  version: 1;
  requestDigest: string;         // = sha256(canonical(BlackBoxRequest))
  verdict: "pass" | "fail";
  observationsDigest: string;    // guest 外观测结果的摘要
  verifierKeyId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;             // 对 (requestDigest, verdict, observationsDigest, …) 的签名
};
```

### 4.2 内核的接受条件(全部满足才继续 → PROPOSING)

1. 签名用**已知 `verifierKeyId`** 验证通过;
2. `requestDigest` 等于内核为**这个 run** 构造的请求摘要——即 `runId / nonce / incidentFingerprint / baseCommit / patchSha256 / verifierBundleSha256 / vmImageSha256` **逐字段绑定**,任一不符即拒;
3. `verdict === "pass"`;
4. `nonce` 未被用过、attestation 未过期(`now < expiresAt`)。

**任何为别的 run / patch / 测试包 / VM 签发的证明都不能复用**(nonce + 全绑定字段保证)。attestation 与 request 一并持久化进 run 的 evidence,供审计与 resume。

---

## 5. 黑盒拓扑

```
Trusted Verifier(guest 外, 可信)
  ├─ 持有隐藏输入、预期结果、签名密钥
  ├─ 启动 Firecracker guest
  ├─ 向 guest 内 patched app 发请求
  ├─ 在 guest 外比较实际输出 vs 预期
  └─ 签发 attestation

Firecracker Guest(不可信, 只放 patched app)
  ├─ 只有 patched app + 运行依赖
  ├─ 无测试源码、无预期答案
  ├─ 无 verifier 密钥
  ├─ 无 worker / Anthropic / GitHub / DB secrets
  └─ 默认断网、rootfs 只读、临时 overlay、资源限额
```

现实约束:Firecracker 需 Linux + KVM,macOS 本地跑不了。§3–§4 的框架层(VerificationProfile、契约、mock attestor、hermetic 签名/重放/绑定测试)全部能在 macOS 上 hermetic 完成;Firecracker adapter 与恶意 patch 黑盒 eval 才需要 Linux worker。

---

## 6. 攻击型验收测试(全部不得进入 PROPOSED)

- 伪造 `/out/result.json`;
- `process.exit(0)` 提前退出;
- 读取 holdout / 测试源码;
- 按测试文件名或 visible-test 输入特判 / 硬编码;
- 重放另一个 patch 的 attestation;
- 改动 patch 后继续用旧证明;
- 篡改 verifier bundle 或 VM image;
- 过期的 nonce / attestation;
- verifier 超时、崩溃、重复回调。

---

## 7. 执行顺序(与 YAGNI sequencing 对齐)

1. **把 RAG 工作移出 `feat/sdlc-agent`**(cherry-pick 到独立分支),让分支只剩 remediation。RAG 的 24-term/2-gram 与已提交设计的 12-term/4·3·2-gram 不同步,单独在 RAG 分支解决。
2. **修正 README/STATUS**,正式收回旧结论(Docker report-proof / holdout 永不可见 / microVM 可选),记录本黑盒决策。
3. **加 `VerificationProfile`,让 `production-black-box` 档 fail-closed**(非框架级;立刻收回旧发布权)。
4. **加 `ATTESTING` 状态 + mock attestor**(框架级)。
5. **hermetic 测试**验证签名、重放、target/nonce 绑定、过期。
6. **在 Linux worker 上实现 Firecracker adapter**。
7. **跑恶意 patch 黑盒 eval**(§6 清单)。
8. 完成后再接真实 Sentry / GitHub App / Draft PR。

第 3–5 步在 macOS 上 hermetic 可测;第 6–7 步需 Linux。

---

## 8. 冻结边界:本方向不破 README §1 的"生产集成冻结"

黑盒 verifier + attestation + Firecracker 是**验证机制**,能用 mock attestor + hermetic 签名/重放测试在 sandbox 上建成并证明,符合"成功标准是机制"。真实 Sentry 摄入、GitHub App、部署 worker、Draft PR 仍然冻结(执行顺序第 8 步之后才重启,且需另一次设计 review)。"生产黑盒验证"里的"生产"指**验证档位/证明强度**,不是"运营一个生产服务"。

---

## 9. 非目标 / YAGNI 边界

- 不在真 Vitest 衬底上重造 fixture 全矩阵——矩阵已在脚本 fixture 上覆盖,机制已证。
- 不做真实 Sentry / GitHub / 部署 worker(冻结)。
- `ATTESTING` 不提前于 Firecracker 落地(无真异步 verifier 时它没有用武之地)。
- attestation 不引入 model 判断——verifier 判断是确定性的、guest 外的比较。
