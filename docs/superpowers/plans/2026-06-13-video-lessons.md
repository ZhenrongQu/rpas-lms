# 视频课时 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 rpas-lms 课时增加可选的 Cloudflare Stream 视频能力，付费视频签名防盗链、免费课时可试看，admin 在后台直传 MP4。

**Architecture:** Lesson 表加可选视频字段（DB-managed，不进 MDX frontmatter）。所有视频 `requireSignedURLs: true`；课时页用现有 `canViewLesson` 判定后，server 端本地用 CF signing key 签发短时效 RS256 JWT 给播放器。后台用 CF Direct Creator Upload 直传（文件不过自有服务器），转码完成由 CF webhook 回写状态。

**Tech Stack:** Next.js 15 (App Router) · Prisma/PostgreSQL · `jose`（RS256 JWT）· `@cloudflare/stream-react`（HLS 播放器）· Node `crypto`（webhook HMAC）· vitest。

**与 spec 的 3 处实现调整：** admin 拒绝返回 404（现有 `requireAdminApi` 约定）；签名密钥用 base64 PEM（CF signing key API 返回 `pem`）；上传先用 simple direct upload（单文件 ≤200MB，少一个 tus 依赖）。

**Seed note:** `scripts/seed-content.ts` 的 `update: lesson` 不含视频字段，Prisma 部分更新天然保留已上传视频，**无需改动**。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `prisma/schema.prisma` | Basic/AdvancedLesson 各加 4 个可选视频字段 |
| `src/lib/video/cloudflareStream.ts` | **新增** — CF 封装：streamConfig、签 token、校验 webhook、创建直传、查状态 |
| `src/lib/video/cloudflareStream.test.ts` | **新增** — 纯函数单测（签 token、校验 webhook） |
| `src/lib/content/dbMappers.ts` | LessonRow 结构类型 + `dbLessonToMeta` 透传视频字段 |
| `src/lib/content/dbMappers.test.ts` | **新增** — 视频字段映射测试 |
| `src/lib/lessons/types.ts` | `LessonMeta` 加视频字段 |
| `app/api/coriander/lessons/[id]/video/upload-url/route.ts` | **新增** — POST 创建直传 URL（admin） |
| `app/api/coriander/lessons/[id]/video/route.ts` | **新增** — PUT 存 UID / DELETE 清除（admin） |
| `app/api/coriander/video/webhook/route.ts` | **新增** — CF 转码完成回调（签名校验，非 admin） |
| `src/components/learn/VideoPlayer.tsx` | **新增** — client，`<Stream>` + signed token |
| `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx` | 渲染 VideoPlayer（READY 时），server 签 token |
| `app/coriander/lessons/[id]/VideoUpload.tsx` | **新增** — client 上传组件 |
| `app/coriander/lessons/[id]/LessonEditForm.tsx` | 嵌入 VideoUpload，LessonRow 类型加视频字段 |

---

## Task 1: 安装依赖 + CF 配置读取

**Files:**
- Modify: `package.json`（经 pnpm add）
- Modify: `.env`（本地开发；生产在 Vercel 配置同名变量）
- Create: `src/lib/video/cloudflareStream.ts`
- Create: `src/lib/video/cloudflareStream.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `pnpm add jose @cloudflare/stream-react`
Expected: `jose` 与 `@cloudflare/stream-react` 进入 `dependencies`。

- [ ] **Step 2: 在 `.env` 添加变量（占位，值进入实现/部署阶段填）**

```
CF_ACCOUNT_ID=
CF_STREAM_API_TOKEN=
CF_STREAM_CUSTOMER_CODE=
CF_STREAM_SIGNING_KEY_ID=
CF_STREAM_SIGNING_KEY_PEM=        # CF signing key API 返回的 base64 pem 原样粘贴
CF_STREAM_WEBHOOK_SECRET=
```

- [ ] **Step 3: 写 `streamConfig` 的失败测试**

Create `src/lib/video/cloudflareStream.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamConfig } from "./cloudflareStream";

afterEach(() => vi.unstubAllEnvs());

describe("streamConfig", () => {
  it("reads env and base64-decodes the signing key PEM", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";
    vi.stubEnv("CF_ACCOUNT_ID", "acct");
    vi.stubEnv("CF_STREAM_API_TOKEN", "tok");
    vi.stubEnv("CF_STREAM_CUSTOMER_CODE", "code");
    vi.stubEnv("CF_STREAM_SIGNING_KEY_ID", "kid");
    vi.stubEnv("CF_STREAM_SIGNING_KEY_PEM", Buffer.from(pem).toString("base64"));
    vi.stubEnv("CF_STREAM_WEBHOOK_SECRET", "secret");

    const cfg = streamConfig();
    expect(cfg.accountId).toBe("acct");
    expect(cfg.signingKeyId).toBe("kid");
    expect(cfg.signingKeyPem).toBe(pem);
  });

  it("throws when a required var is missing", () => {
    vi.stubEnv("CF_ACCOUNT_ID", "");
    expect(() => streamConfig()).toThrow();
  });
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts`
Expected: FAIL（`streamConfig` is not a function / 模块不存在）。

- [ ] **Step 5: 实现 `cloudflareStream.ts` 的 streamConfig**

Create `src/lib/video/cloudflareStream.ts`:

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export interface StreamConfig {
  accountId: string;
  apiToken: string;
  customerCode: string;
  signingKeyId: string;
  signingKeyPem: string;
  webhookSecret: string;
}

/** Reads Cloudflare Stream config from env; base64-decodes the signing key PEM. */
export function streamConfig(): StreamConfig {
  return {
    accountId: required("CF_ACCOUNT_ID"),
    apiToken: required("CF_STREAM_API_TOKEN"),
    customerCode: required("CF_STREAM_CUSTOMER_CODE"),
    signingKeyId: required("CF_STREAM_SIGNING_KEY_ID"),
    signingKeyPem: Buffer.from(required("CF_STREAM_SIGNING_KEY_PEM"), "base64").toString("utf8"),
    webhookSecret: required("CF_STREAM_WEBHOOK_SECRET"),
  };
}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/video/cloudflareStream.ts src/lib/video/cloudflareStream.test.ts
git commit -m "feat(video): add CF Stream deps and streamConfig"
```

---

## Task 2: Prisma schema 加视频字段

**Files:**
- Modify: `prisma/schema.prisma`（`BasicLesson` 与 `AdvancedLesson`）

- [ ] **Step 1: 给 `BasicLesson` 加字段**

在 `model BasicLesson` 的 `updatedAt` 行之后、`progress` 关系行之前插入：

```prisma
  videoUid          String?
  videoStatus       String?   // "PROCESSING" | "READY" | "ERROR"
  videoDurationSec  Int?
  videoThumbnailUrl String?
```

- [ ] **Step 2: 给 `AdvancedLesson` 加相同字段**

在 `model AdvancedLesson` 的 `updatedAt` 行之后、`progress` 关系行之前插入同样的 4 行。

- [ ] **Step 3: 推送 schema 到数据库并重新生成 client**

Run: `pnpm db:push && pnpm db:generate`
Expected: `db push` 报告新增 4 列 × 2 表；`prisma generate` 成功。

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: PASS（暂无新代码引用这些字段）。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(video): add lesson video columns"
```

---

## Task 3: dbMappers 透传视频字段 + LessonMeta 类型

**Files:**
- Modify: `src/lib/lessons/types.ts:14-24`（`LessonMeta`）
- Modify: `src/lib/content/dbMappers.ts:33-46`（`LessonRow`）和 `:89-101`（`dbLessonToMeta`）
- Test: `src/lib/content/dbMappers.test.ts`（新增）

- [ ] **Step 1: 写失败测试**

Create `src/lib/content/dbMappers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dbLessonToMeta } from "./dbMappers";

const baseRow = {
  lessonId: "basic/air-law/intro",
  course: "basic",
  moduleId: "air-law",
  slug: "intro",
  titleEN: "Intro",
  titleZH: "介绍",
  order: 1,
  estMinutes: 5,
  certLevel: "BASIC",
  access: "FREE",
  bodyEN: "",
  bodyZH: "",
};

describe("dbLessonToMeta — video fields", () => {
  it("passes video fields through when present", () => {
    const meta = dbLessonToMeta(
      { ...baseRow, videoUid: "abc123", videoStatus: "READY", videoDurationSec: 600, videoThumbnailUrl: "https://t/x.jpg" },
      "en",
    );
    expect(meta.videoUid).toBe("abc123");
    expect(meta.videoStatus).toBe("READY");
    expect(meta.videoDurationSec).toBe(600);
    expect(meta.videoThumbnailUrl).toBe("https://t/x.jpg");
  });

  it("yields null video fields for a text-only lesson", () => {
    const meta = dbLessonToMeta(
      { ...baseRow, videoUid: null, videoStatus: null, videoDurationSec: null, videoThumbnailUrl: null },
      "zh",
    );
    expect(meta.videoUid).toBeNull();
    expect(meta.title).toBe("介绍");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test src/lib/content/dbMappers.test.ts`
Expected: FAIL（`videoUid` 不在 `LessonMeta` 上 / 类型错误）。

- [ ] **Step 3: 给 `LessonMeta` 加字段**

`src/lib/lessons/types.ts`，在 `access` 字段后追加：

```ts
  videoUid: string | null;
  videoStatus: string | null;
  videoDurationSec: number | null;
  videoThumbnailUrl: string | null;
```

- [ ] **Step 4: 给 `LessonRow` 结构类型加字段**

`src/lib/content/dbMappers.ts` 的 `type LessonRow`，在 `bodyZH: string;` 后追加：

```ts
  videoUid: string | null;
  videoStatus: string | null;
  videoDurationSec: number | null;
  videoThumbnailUrl: string | null;
```

- [ ] **Step 5: `dbLessonToMeta` 透传**

在 `dbLessonToMeta` 返回对象的 `access` 行后追加：

```ts
    videoUid: row.videoUid,
    videoStatus: row.videoStatus,
    videoDurationSec: row.videoDurationSec,
    videoThumbnailUrl: row.videoThumbnailUrl,
```

- [ ] **Step 6: 运行测试 + 类型检查**

Run: `pnpm test src/lib/content/dbMappers.test.ts && pnpm typecheck`
Expected: 测试 PASS；typecheck PASS（`getLesson` 返回的 meta 自动带新字段，无需改 catalog.ts）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/lessons/types.ts src/lib/content/dbMappers.ts src/lib/content/dbMappers.test.ts
git commit -m "feat(video): thread video fields through lesson meta mapper"
```

---

## Task 4: signPlaybackToken（签名 JWT）

**Files:**
- Modify: `src/lib/video/cloudflareStream.ts`
- Modify: `src/lib/video/cloudflareStream.test.ts`

- [ ] **Step 1: 写失败测试**

在 `cloudflareStream.test.ts` 顶部追加 import，并新增 describe：

```ts
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";
import { signPlaybackToken } from "./cloudflareStream";

describe("signPlaybackToken", () => {
  it("signs an RS256 JWT whose sub is the video uid and verifies with the public key", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const pem = await exportPKCS8(privateKey);
    const spki = await exportSPKI(publicKey);

    const token = await signPlaybackToken({
      videoUid: "vid-123",
      keyId: "key-abc",
      privateKeyPem: pem,
      expiresInSec: 3600,
    });

    const { payload, protectedHeader } = await jwtVerify(token, await importSPKI(spki, "RS256"));
    expect(payload.sub).toBe("vid-123");
    expect(protectedHeader.kid).toBe("key-abc");
    expect(typeof payload.exp).toBe("number");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts -t signPlaybackToken`
Expected: FAIL（`signPlaybackToken` 未定义）。

- [ ] **Step 3: 实现 signPlaybackToken**

在 `cloudflareStream.ts` 追加（顶部加 `import { SignJWT, importPKCS8 } from "jose";`）：

```ts
/** Signs a short-lived RS256 playback token for a Cloudflare Stream signed-URL video. */
export async function signPlaybackToken(opts: {
  videoUid: string;
  keyId: string;
  privateKeyPem: string;
  expiresInSec?: number;
}): Promise<string> {
  const key = await importPKCS8(opts.privateKeyPem, "RS256");
  const ttl = opts.expiresInSec ?? 6 * 60 * 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: opts.keyId })
    .setSubject(opts.videoUid)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts -t signPlaybackToken`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/video/cloudflareStream.ts src/lib/video/cloudflareStream.test.ts
git commit -m "feat(video): sign RS256 playback tokens"
```

---

## Task 5: verifyWebhookSignature

**Files:**
- Modify: `src/lib/video/cloudflareStream.ts`
- Modify: `src/lib/video/cloudflareStream.test.ts`

CF webhook header 形如 `Webhook-Signature: time=<unix>,sig1=<hex>`，签名 = `HMAC-SHA256(secret, "<time>.<rawBody>")`。

- [ ] **Step 1: 写失败测试**

在 `cloudflareStream.test.ts` 追加（顶部加 `import { createHmac } from "node:crypto";` 和 import `verifyWebhookSignature`）：

```ts
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./cloudflareStream";

function sign(body: string, time: number, secret: string): string {
  const sig = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
  return `time=${time},sig1=${sig}`;
}

describe("verifyWebhookSignature", () => {
  const secret = "whsec";
  const body = '{"uid":"v1"}';
  const now = 1_000_000;

  it("accepts a valid, fresh signature", () => {
    const header = sign(body, now, secret);
    expect(verifyWebhookSignature({ body, signatureHeader: header, secret, now: now * 1000 })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, now, secret);
    expect(verifyWebhookSignature({ body: '{"uid":"hacked"}', signatureHeader: header, secret, now: now * 1000 })).toBe(false);
  });

  it("rejects a stale signature beyond tolerance", () => {
    const header = sign(body, now, secret);
    const later = (now + 999) * 1000;
    expect(verifyWebhookSignature({ body, signatureHeader: header, secret, now: later, toleranceSec: 300 })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts -t verifyWebhookSignature`
Expected: FAIL（未定义）。

- [ ] **Step 3: 实现 verifyWebhookSignature**

在 `cloudflareStream.ts` 追加（顶部加 `import { createHmac, timingSafeEqual } from "node:crypto";`）：

```ts
/** Verifies a Cloudflare Stream webhook signature header (`time=…,sig1=…`). */
export function verifyWebhookSignature(opts: {
  body: string;
  signatureHeader: string;
  secret: string;
  toleranceSec?: number;
  now?: number;
}): boolean {
  const parts = Object.fromEntries(
    opts.signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const time = Number(parts.time);
  const sig1 = parts.sig1;
  if (!Number.isFinite(time) || !sig1) return false;

  const tolerance = opts.toleranceSec ?? 300;
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - time) > tolerance) return false;

  const expected = createHmac("sha256", opts.secret).update(`${time}.${opts.body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig1);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test src/lib/video/cloudflareStream.test.ts -t verifyWebhookSignature`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/video/cloudflareStream.ts src/lib/video/cloudflareStream.test.ts
git commit -m "feat(video): verify CF Stream webhook signatures"
```

---

## Task 6: createDirectUpload + fetchVideoStatus（fetch 包装）

**Files:**
- Modify: `src/lib/video/cloudflareStream.ts`

这两个是 CF REST 薄包装，遵循项目惯例不写单测（无外部 HTTP 测试设施），实现完成后在 Task 7 手测。

- [ ] **Step 1: 实现两个函数**

在 `cloudflareStream.ts` 追加：

```ts
const CF_API = "https://api.cloudflare.com/client/v4";

/** Creates a one-time direct-creator-upload URL (signed-URL video, ≤200MB single POST). */
export async function createDirectUpload(opts: {
  accountId: string;
  apiToken: string;
  maxDurationSeconds: number;
}): Promise<{ uploadURL: string; uid: string }> {
  const res = await fetch(`${CF_API}/accounts/${opts.accountId}/stream/direct_upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ maxDurationSeconds: opts.maxDurationSeconds, requireSignedURLs: true }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`CF direct_upload failed: ${JSON.stringify(json.errors ?? json)}`);
  return { uploadURL: json.result.uploadURL, uid: json.result.uid };
}

/** Reads a video's transcode status (fallback to webhook). */
export async function fetchVideoStatus(opts: {
  accountId: string;
  apiToken: string;
  uid: string;
}): Promise<{ state: string; durationSec: number | null; thumbnail: string | null }> {
  const res = await fetch(`${CF_API}/accounts/${opts.accountId}/stream/${opts.uid}`, {
    headers: { Authorization: `Bearer ${opts.apiToken}` },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`CF status failed: ${JSON.stringify(json.errors ?? json)}`);
  const r = json.result;
  return {
    state: r.status?.state ?? "unknown",
    durationSec: typeof r.duration === "number" && r.duration > 0 ? Math.round(r.duration) : null,
    thumbnail: r.thumbnail ?? null,
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/lib/video/cloudflareStream.ts
git commit -m "feat(video): CF direct upload + status helpers"
```

---

## Task 7: upload-url API 路由

**Files:**
- Create: `app/api/coriander/lessons/[id]/video/upload-url/route.ts`

- [ ] **Step 1: 实现路由**

```ts
import { requireAdminApi } from "../../../../../../../src/lib/auth/adminGuard";
import { findLessonById } from "../../../../../../../src/lib/admin/lessons";
import { streamConfig, createDirectUpload } from "../../../../../../../src/lib/video/cloudflareStream";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/coriander/lessons/[id]/video/upload-url — one-time CF direct upload URL (admin). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const cfg = streamConfig();
  const { uploadURL, uid } = await createDirectUpload({
    accountId: cfg.accountId,
    apiToken: cfg.apiToken,
    maxDurationSeconds: 7200,
  });
  return Response.json({ uploadURL, uid }, { status: 200 });
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。（导入相对路径段数：从 `app/api/coriander/lessons/[id]/video/upload-url/` 回到仓库根需 7 个 `../`，确认 `src/lib/...` 可解析。）

- [ ] **Step 3: Commit**

```bash
git add "app/api/coriander/lessons/[id]/video/upload-url/route.ts"
git commit -m "feat(video): admin direct-upload URL route"
```

---

## Task 8: video PUT / DELETE API 路由

**Files:**
- Create: `app/api/coriander/lessons/[id]/video/route.ts`

- [ ] **Step 1: 实现路由**

```ts
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../../src/lib/db";
import { requireAdminApi } from "../../../../../../src/lib/auth/adminGuard";
import { findLessonById } from "../../../../../../src/lib/admin/lessons";

type Ctx = { params: Promise<{ id: string }> };

const putSchema = z.object({ videoUid: z.string().min(1) });

function revalidateLesson(course: string, moduleId: string, slug: string) {
  revalidatePath(`/en/learn/${course}/${moduleId}/${slug}`);
  revalidatePath(`/zh/learn/${course}/${moduleId}/${slug}`);
}

/** PUT — attach a freshly uploaded video uid (status starts at PROCESSING). */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });

  const data = { videoUid: parsed.data.videoUid, videoStatus: "PROCESSING", videoDurationSec: null, videoThumbnailUrl: null };
  const row =
    found.course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });
  revalidateLesson(found.row.course, found.row.moduleId, found.row.slug);
  return Response.json(row, { status: 200 });
}

/** DELETE — clear the video from a lesson. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;
  const { id } = await ctx.params;
  const found = await findLessonById(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  const data = { videoUid: null, videoStatus: null, videoDurationSec: null, videoThumbnailUrl: null };
  const row =
    found.course === "basic"
      ? await prisma.basicLesson.update({ where: { id }, data })
      : await prisma.advancedLesson.update({ where: { id }, data });
  revalidateLesson(found.row.course, found.row.moduleId, found.row.slug);
  return Response.json(row, { status: 200 });
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add "app/api/coriander/lessons/[id]/video/route.ts"
git commit -m "feat(video): attach/clear lesson video route"
```

---

## Task 9: webhook 路由

**Files:**
- Create: `app/api/coriander/video/webhook/route.ts`

CF Stream webhook 发送视频对象 `{ uid, status: { state }, duration, thumbnail }`，`state ∈ inprogress|ready|error`。

- [ ] **Step 1: 实现路由**

```ts
import { prisma } from "../../../../../src/lib/db";
import { streamConfig, verifyWebhookSignature } from "../../../../../src/lib/video/cloudflareStream";

/** POST /api/coriander/video/webhook — CF transcode notifications (signature-gated, no admin). */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const header = req.headers.get("webhook-signature") ?? "";
  const cfg = streamConfig();
  if (!verifyWebhookSignature({ body: raw, signatureHeader: header, secret: cfg.webhookSecret })) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as {
    uid?: string;
    status?: { state?: string };
    duration?: number;
    thumbnail?: string;
  };
  if (!payload.uid) return Response.json({ ok: true }, { status: 200 });

  const state = payload.status?.state;
  const videoStatus = state === "ready" ? "READY" : state === "error" ? "ERROR" : "PROCESSING";
  const data = {
    videoStatus,
    videoDurationSec: typeof payload.duration === "number" && payload.duration > 0 ? Math.round(payload.duration) : null,
    videoThumbnailUrl: payload.thumbnail ?? null,
  };

  await prisma.basicLesson.updateMany({ where: { videoUid: payload.uid }, data });
  await prisma.advancedLesson.updateMany({ where: { videoUid: payload.uid }, data });
  return Response.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add "app/api/coriander/video/webhook/route.ts"
git commit -m "feat(video): CF transcode webhook route"
```

---

## Task 10: VideoPlayer 组件 + 课时页接入

**Files:**
- Create: `src/components/learn/VideoPlayer.tsx`
- Modify: `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx`

- [ ] **Step 1: 实现 VideoPlayer（client）**

Create `src/components/learn/VideoPlayer.tsx`:

```tsx
'use client';

import { Stream } from '@cloudflare/stream-react';

/** Plays a Cloudflare Stream signed-URL video. `token` is a signed playback JWT. */
export default function VideoPlayer({ token }: { token: string }) {
  return (
    <div className="lesson-video">
      <Stream src={token} controls responsive />
    </div>
  );
}
```

- [ ] **Step 2: 在课时页签发 token 并渲染**

`app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx`：

加 import：
```ts
import VideoPlayer from '@/components/learn/VideoPlayer';
import { streamConfig, signPlaybackToken } from '@/lib/video/cloudflareStream';
```

在 `canViewLesson` 通过之后（即现有 locked-gate 的 `return` 之后）、最终 `return (` 之前插入：
```ts
  let videoToken: string | null = null;
  if (lesson.meta.videoUid && lesson.meta.videoStatus === 'READY') {
    const cfg = streamConfig();
    videoToken = await signPlaybackToken({
      videoUid: lesson.meta.videoUid,
      keyId: cfg.signingKeyId,
      privateKeyPem: cfg.signingKeyPem,
    });
  }
```

把 `LessonShell` 内的内容改为视频在正文之上：
```tsx
        <LessonShell lessonId={lesson.meta.lessonId} nextHref={nextHref} backHref={backHref}>
          {videoToken && <VideoPlayer token={videoToken} />}
          <MDXContent source={lesson.body} locale={locale} />
        </LessonShell>
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: PASS（`LessonShell` children 接受多个节点，无需改它）。

- [ ] **Step 4: Commit**

```bash
git add src/components/learn/VideoPlayer.tsx "app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx"
git commit -m "feat(video): render signed Stream player on lesson page"
```

---

## Task 11: VideoUpload 组件 + 编辑页接入

**Files:**
- Create: `app/coriander/lessons/[id]/VideoUpload.tsx`
- Modify: `app/coriander/lessons/[id]/LessonEditForm.tsx`

- [ ] **Step 1: 实现 VideoUpload（client）**

Create `app/coriander/lessons/[id]/VideoUpload.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_API_BASE } from "@/lib/admin/route";

type Props = {
  lessonId: string;
  videoUid: string | null;
  videoStatus: string | null;
};

export default function VideoUpload({ lessonId, videoUid, videoStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const urlRes = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video/upload-url`, { method: "POST" });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, uid } = await urlRes.json();

      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch(uploadURL, { method: "POST", body: form });
      if (!upRes.ok) throw new Error("Upload to Cloudflare failed");

      const saveRes = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUid: uid }),
      });
      if (!saveRes.ok) throw new Error("Failed to save video");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove video");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-form-row">
      <label>Video</label>
      <div>
        {videoUid ? (
          <p className="admin-readonly">
            {videoUid} — {videoStatus ?? "PROCESSING"}{" "}
            <button type="button" onClick={handleRemove} disabled={busy}>Remove</button>
          </p>
        ) : (
          <input
            type="file"
            accept="video/mp4,video/*"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
        )}
        {busy && <p className="admin-hint">Working… (single file ≤ 200MB)</p>}
        {error && <p className="admin-errors">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 接入 LessonEditForm**

`app/coriander/lessons/[id]/LessonEditForm.tsx`：

在文件顶部加 import：
```ts
import VideoUpload from "./VideoUpload";
```

在 `type LessonRow` 的 `bodyZH: string;` 后追加：
```ts
  videoUid: string | null;
  videoStatus: string | null;
```

在 Access 的 `admin-form-row` 之后、MDX hint `<p>` 之前插入：
```tsx
        <VideoUpload lessonId={lesson.id} videoUid={lesson.videoUid} videoStatus={lesson.videoStatus} />
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: PASS（`page.tsx` 传入的 `found.row` 含视频字段，匹配扩展后的 `LessonRow`）。

- [ ] **Step 4: Commit**

```bash
git add "app/coriander/lessons/[id]/VideoUpload.tsx" "app/coriander/lessons/[id]/LessonEditForm.tsx"
git commit -m "feat(video): admin video upload UI on lesson editor"
```

---

## Task 12: 全量回归 + 手动验证清单

**Files:** 无（验证）

- [ ] **Step 1: 全量测试 + 构建**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 全 PASS。

- [ ] **Step 2: 手动验证（需先在 Cloudflare 配好 6 个 env + 在 CF 配置 webhook 指向 `/api/coriander/video/webhook`）**

逐项确认：
- coriander 课时编辑页能选 MP4 上传 → 显示 `PROCESSING`
- 转码完成后 webhook 把状态刷成 `READY`（或手动调 `fetchVideoStatus` 兜底）
- FREE 课时未登录访客能看到视频并播放（签名 token 生效）
- PAID 课时未购买用户看到 🔒 locked gate、不签发 token
- PAID 课时已购买用户能播放
- 后台 Remove 能清除视频，课时页回到纯图文

- [ ] **Step 3: 合并/收尾**

按 `superpowers:finishing-a-development-branch` 决定合并方式。

---

## Self-Review

**Spec coverage：**
- 数据模型 4 字段 → Task 2/3 ✓
- 直传上传流程（创建 URL → 直传 → 写 UID → webhook）→ Task 6/7/8/9/11 ✓
- 统一签名 + canViewLesson 防盗链 → Task 4/10 ✓
- 免费试看（FREE 课时签发）/ PAID gate → Task 10 + 手测 ✓
- 错误处理（webhook 401、PROCESSING/ERROR 不渲染播放器、失去 entitlement 走 gate）→ Task 9/10 ✓
- 测试（签 token、webhook 校验、mapper）→ Task 4/5/3 ✓
- seed 保留视频字段 → 天然满足（header note）✓
- YAGNI 排除项 → 未出现在任何 task ✓

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码。

**Type consistency：** `LessonMeta`/`LessonRow` 视频字段四元组在 Task 3、10、11 命名一致（`videoUid/videoStatus/videoDurationSec/videoThumbnailUrl`）；`signPlaybackToken` 入参 `{videoUid,keyId,privateKeyPem,expiresInSec}` 在 Task 4 定义、Task 10 调用一致；`streamConfig` 字段在 Task 1 定义、Task 7/9/10 使用一致。
