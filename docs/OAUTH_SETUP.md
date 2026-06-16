# Google & Apple 登录开通指引

代码已支持两者(`auth.ts` 在检测到环境变量时自动启用)。你只需在各自后台**创建 OAuth 应用、拿到密钥**,然后把密钥配到 Vercel(Production + Preview)和本地 `.env`。没配密钥时,登录按钮自动隐藏。

**回调地址(各后台都要填这个):**
- 生产:`https://pacificdrone.ca/api/auth/callback/{google|apple}`
- dev 预览:`https://dev.pacificdrone.ca/api/auth/callback/{google|apple}`
- 本地:`http://localhost:3000/api/auth/callback/google`(Apple **不支持** localhost)

> 提醒:手机 App(reader 模式)**故意隐藏** Google/Apple 按钮(webview 用不了 Google 登录)。这一项是给**网页版**的,对 App v1 无影响。

---

## 第一部分 — Google(较简单,约 15 分钟)

1. 打开 [Google Cloud Console](https://console.cloud.google.com) → 新建项目(如 "Pacific Drone")或选已有项目。
2. **APIs & Services → OAuth consent screen(同意屏幕)**:
   - User type 选 **External** → Create。
   - App name:`Pacific Drone`;support email、developer contact 填你的邮箱。
   - Authorized domains 填:`pacificdrone.ca`
   - Scopes:保留默认(email、profile、openid)即可。
   - 发布(Publish);或先留 Testing 并把你自己的邮箱加为 test user。
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type:**Web application**
   - Name:`Pacific Drone Web`
   - **Authorized redirect URIs**(把要用的都加上):
     - `https://pacificdrone.ca/api/auth/callback/google`
     - `https://dev.pacificdrone.ca/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
   - Create → 复制 **Client ID** 和 **Client secret**。
4. 把这两个给我(或你自己填 Vercel):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

---

## 第二部分 — Apple(较复杂,约 30–45 分钟,需 Apple Developer 账号 $99/年)

> ⚠️ Apple 的 "client secret" 是一段**会过期的签名 JWT**(最长 6 个月),到期要重新生成。心里有数。

1. [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles → Identifiers**:
   - **App ID**(若还没有):`+` → App IDs → App → bundle id 如 `ca.pacificdrone.app` → 勾选 **Sign In with Apple** → Register。(可与 iOS App 用同一个 id。)
   - **Services ID**:`+` → Services IDs → 描述 `Pacific Drone Web` → 标识符如 `ca.pacificdrone.web` → Register。**这个标识符 = `APPLE_CLIENT_ID`**。
     - 再编辑该 Services ID → 勾 **Sign In with Apple** → Configure:
       - Primary App ID:上面的 App ID
       - Domains:`pacificdrone.ca`(和 `dev.pacificdrone.ca`)
       - Return URLs:`https://pacificdrone.ca/api/auth/callback/apple`(+ dev 那个)
       - 保存(Apple 会要求**验证域名**,按它的提示传一个文件/记录)。
2. **Keys** → `+` → 名称 `Pacific Drone SignIn` → 勾 Sign In with Apple → Configure 选 primary App ID → Register → **下载 .p8 密钥文件(只能下一次)**。记下 **Key ID** 和右上角的 **Team ID**。
3. **生成 client secret JWT**(= `APPLE_CLIENT_SECRET`):用 .p8 + Team ID + Key ID + Services ID 签一个 ES256 JWT。拿到 .p8 后**告诉我**,我给你一个小脚本直接生成(并教你到期怎么重生)。
4. 把这两个给我(或填 Vercel):
   - `APPLE_CLIENT_ID` = Services ID(如 `ca.pacificdrone.web`)
   - `APPLE_CLIENT_SECRET` = 生成的 JWT

---

## 密钥配到哪

每个 provider 的两个变量,要进 **3 个地方**:
- Vercel → **Production** scope(给 pacificdrone.ca)
- Vercel → **Preview** scope / `dev` 分支(给 dev.pacificdrone.ca)
- 本地 `.env`(给 localhost —— 仅 Google;Apple 无 localhost)

**你把值给我,我用 CLI 帮你配 Vercel 那两处。** 配完下次部署自动生效,按钮自动出现。

## 建议顺序
先做 **Google**(简单、当天能通);**Apple** 复杂且密钥会过期,可以稍后单独搞。
