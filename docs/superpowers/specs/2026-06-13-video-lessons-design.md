# 视频课时 — 设计文档

- **日期**：2026-06-13
- **状态**：已批准设计，待写实现计划
- **范围**：给 rpas-lms 的课时加视频能力，对标 Thinkific 的视频课程

## 背景与目标

rpas-lms 现有课时只有图文 MDX 正文（`BasicLesson.bodyEN/bodyZH`）。
对标 Thinkific / Coastal Drone，最大的缺口是**视频课时**。本设计为课时
增加可选的视频能力，使一节课可以是：纯图文、纯视频、或图文+视频。

目标：

- 付费正课视频要**防盗链**（签名 URL），同时支持**免费试看**
- 视频是课时的可选字段，和现有 MDX 正文并存，互不强制
- 复用现有的 `access: FREE|PAID` + `canViewLesson` 访问控制，不另造一套
- admin 在 coriander 后台**直传 MP4**

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 视频形态 | 免费试看 + 付费正课都有，付费部分需防盗链 |
| 视频 vs 图文 | 一节课可纯图文 / 纯视频 / 图文+视频；视频为可选字段；页面布局后期再定 |
| 完课判定 | **沿用现有手动「标记完成」按钮**，视频只管播放 |
| 免费试看 | 复用整节课 `access: FREE\|PAID` 模型，**不做**付费课内 X 秒预览片段 |
| 托管商 | **Cloudflare Stream**（性价比、自带签名 URL 防盗链、自带 HLS 播放器） |
| 接入方式 | coriander 后台**直传 MP4**（CF Direct Creator Upload，文件不过自有服务器） |

## 1. 数据模型（Prisma）

给 `BasicLesson` 和 `AdvancedLesson`**两张表**各加 4 个可选字段：

```prisma
videoUid          String?   // Cloudflare Stream 的 video UID
videoStatus       String?   // "PROCESSING" | "READY" | "ERROR"
videoDurationSec  Int?      // 转码完成后由 CF 回填
videoThumbnailUrl String?   // CF 自动生成的封面 URL
```

- 字段全部可选（nullable）。纯图文课这些字段为空；纯视频课 MDX body 为空；混合课两者皆有。
- 视频字段为 **DB-managed**，由 coriander 后台写入，**不进入 MDX frontmatter**，因此 `FrontmatterSchema` 不变。
- `scripts/seed-content.ts` 的 upsert 必须**保留已有视频字段**——图文 re-seed 不能清空运营已上传的视频。

## 2. 上传流程（CF Direct Creator Upload）

文件直传到 Cloudflare，**不经过自有服务器**（省带宽，支持大文件断点续传）。

```
1. admin 在 coriander 课时编辑页选择 MP4
2. 前端 → POST /api/coriander/lessons/[id]/video/upload-url
   后端调 CF direct_upload API（requireSignedURLs: true）获取一次性上传 URL
3. 前端用 tus 协议把文件直传到该 CF URL
4. 前端拿到 video UID → PUT /api/coriander/lessons/[id]/video
   写入 videoUid + videoStatus=PROCESSING
5. CF 异步转码完成 → webhook 打到 /api/coriander/video/webhook
   校验签名后更新 videoStatus=READY + videoDurationSec + videoThumbnailUrl
```

## 3. 播放 + 防盗链（统一签名）

**所有教学视频统一设 `requireSignedURLs: true`**，访问控制完全交给现有 `canViewLesson`：

- 课时页（server component）先跑 `canViewLesson(tier, lesson.meta.access)`（现有逻辑不改）
- 通过后，服务端用 CF signing key **本地签发短时效 JWT playback token**（exp = 6 小时）
- FREE 课时：能进入页面即签发 → 免费试看成立
- PAID 课时：`canViewLesson` 不通过则不签发 → 显示现有 🔒 锁定 gate（`PurchaseButton` / 登录）
- 播放器用 `@cloudflare/stream-react` 的 `<Stream>` 组件 + `signedToken`，自带 HLS 自适应码率

这样防盗链逻辑统一，且天然对齐付费体系；access 是否变化都不影响视频的签名设置。

## 4. 文件改动清单

**数据层**
- `prisma/schema.prisma` — Basic/AdvancedLesson 加 4 字段 + migration
- `src/lib/content/dbMappers.ts`、`src/lib/lessons/types.ts`、`src/lib/lessons/catalog.ts` — 带上视频字段
- `scripts/seed-content.ts` — upsert 保留视频字段

**新增：CF 封装模块（隔离、可单测）**
- `src/lib/video/cloudflareStream.ts` — 纯函数：创建直传 URL、签发 playback JWT、校验 webhook 签名、查转码状态

**新增 API 路由**
- `app/api/coriander/lessons/[id]/video/upload-url/route.ts` — 创建直传 URL（admin only）
- `app/api/coriander/lessons/[id]/video/route.ts` — `PUT` 存 UID / `DELETE` 移除视频（admin only）
- `app/api/coriander/video/webhook/route.ts` — 接收 CF ready 通知，校验签名后更新状态

**前端组件**
- `src/components/learn/VideoPlayer.tsx`（client）— `<Stream>` + signedToken，置于 `LessonShell` 内、MDX 正文上方
- coriander 课时编辑页加 `VideoUpload.tsx` — 选文件 → tus 直传 → 显示转码状态
- `app/[locale]/learn/[course]/[moduleId]/[slug]/page.tsx` — 视频存在且 READY 时渲染 `VideoPlayer`，服务端签发 token

**环境变量**（`.env`）
- `CF_ACCOUNT_ID`、`CF_STREAM_API_TOKEN`、`CF_STREAM_SIGNING_KEY_ID`、`CF_STREAM_SIGNING_KEY_JWK`、`CF_STREAM_CUSTOMER_CODE`、`CF_STREAM_WEBHOOK_SECRET`

## 5. 错误处理

| 场景 | 处理 |
|---|---|
| 上传失败 | 前端报错可重试；lesson 不写 UID |
| 转码失败 | webhook 报 error → `videoStatus=ERROR`，后台显示「转码失败，请重传」 |
| PROCESSING / ERROR 状态 | 播放位显示占位（"视频处理中"），不渲染播放器 |
| token 过期 | 6h 时效；播放器报错时刷新页面重签 |
| 失去 entitlement | `canViewLesson` 不通过 → 不签发 token → 现有 🔒 gate |
| webhook 安全 | 强制校验 CF 签名头，非法请求拒绝（401） |

## 6. 测试（沿用 vitest）

- `cloudflareStream.ts`：JWT 签发（给定 key+uid → 可验证、exp 正确）；webhook 签名校验（合法通过、篡改拒绝）
- `dbMappers`：视频字段映射正确
- 路由鉴权：upload-url / video PUT 非 admin → 403；webhook 错误签名 → 401

## 7. 明确不做（YAGNI）

- 观看进度上报 / 断点续看 / 看够自动完成（已选手动完成）
- 付费课内 X 秒预览片段
- 视频内嵌测验（属另一个模块）
- 手动选码率（CF 自适应自动处理）
- 字幕 / 多音轨

## 8. 后期再定（不阻塞本期）

- 视频与图文的精确页面布局（默认：视频在 MDX 正文上方）
- 后台直传组件的细节交互（进度条样式、并发上传等）
