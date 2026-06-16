# iOS setup — Pacific Drone app

Step-by-step to build and run the iOS app from this `mobile/` project. The `ios/` native
project is **not committed** because it needs macOS tooling that wasn't available when the
project was scaffolded — you generate it once locally (step 1).

## 0. Prerequisites (one-time)

- macOS with **full Xcode** (Mac App Store — not just Command Line Tools). After installing:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  ```
  then open Xcode once to accept the license and install components.
- **CocoaPods**: `brew install cocoapods` (or `sudo gem install cocoapods`).
- Node 20+, and `npm install` already run in `mobile/`.
- An **Apple Developer account** (needed for device builds + submission; the simulator works
  without one).

Verify: `xcodebuild -version` and `pod --version` both print versions.

## 1. Generate the iOS project

```bash
cd mobile
npx cap add ios      # creates ios/ and runs pod install
npm run assets       # generate iOS app icon + splash from assets/logo.png
npx cap sync ios
```

## 2. Configure signing (once)

```bash
npm run open:ios     # opens ios/App/App.xcworkspace in Xcode
```

In Xcode → target **App** → **Signing & Capabilities**:

- Tick **Automatically manage signing**.
- Pick your **Team**.
- Bundle Identifier is `ca.pacificdrone.app` (matches `appId`). If you change it, also change
  `appId` in `capacitor.config.ts`.

## 3. Run

- **Simulator:** choose an iPhone simulator in Xcode and press ▶, or `npm run run:ios`.
- **Device:** connect the iPhone, trust the Mac, select it in Xcode, press ▶ (needs a Team).

## 4. Point it at your site

- **Production (default):** `server.url = https://pacificdrone.ca`. The **Cloudflare allow
  rule for the `RPASApp` UA must exist** or the WebView is 403-blocked (see `README.md`).
- **Local dev:** iOS ATS blocks plain HTTP, so expose `pnpm dev` over HTTPS with a tunnel
  rather than a cleartext exception:
  ```bash
  # repo root:  pnpm dev   then:  cloudflared tunnel --url http://localhost:3000
  CAP_SERVER_URL="https://<your-tunnel>.trycloudflare.com" npm run sync
  npm run run:ios
  ```

## 5. Submit

- Set marketing/build version in Xcode (target → General → Identity).
- **Product → Archive** → distribute to **App Store Connect** → TestFlight → submit for review.
- v1 offers no third-party login, so Sign in with Apple isn't required (Guideline 4.8).
- Review notes: explain it's an LMS in **reader mode** (course purchases happen on the website),
  and provide the test account `learner@rpas.test`.

## Notes

- iOS assets regenerate from `assets/logo.svg` → `assets/logo.png`; rerun `npm run assets`
  after editing the art.
- Keep the bundle id / `appId` and `appendUserAgentString` in sync with
  `src/lib/platform.ts` (`NATIVE_UA_MARKER`).
