# Pacific Drone — Mobile (Capacitor)

Thin native iOS/Android shell for the RPAS LMS. It does **not** bundle the app — the
WebView loads the live site (`server.url` in `capacitor.config.ts`). One web codebase
(the Next.js app in the repo root) powers the website and both apps.

## How it works

- The WebView appends `RPASApp` to its User-Agent (`appendUserAgentString`). The server
  reads this (`src/lib/platform.ts` → `NATIVE_UA_MARKER`) to run **reader mode** inside the
  app: course-purchase buttons and Google/Apple sign-in are hidden (App Store / Play rules).
  **These two strings must stay in sync.**
- Because the app loads the live site, **reader-mode changes only show up once the web
  changes are deployed** to whatever `server.url` points at (prod, or your dev machine).

## Cloudflare / WAF (required before the app can load prod)

pacificdrone.ca sits behind Cloudflare, which **blocks the WebView by default** — a fresh
load returns Cloudflare's "Sorry, you have been blocked" page (verified: a normal browser
UA, our `RPASApp` UA, and plain curl all get HTTP 403). Allow the app in the Cloudflare
dashboard with a WAF custom rule:

- **If** `http.user_agent contains "RPASApp"`
- **Then** action **Skip** → Super Bot Fight Mode + remaining custom rules (or **Allow**).

This keys off the same `RPASApp` UA marker the app already sends. (A spoofable UA only
bypasses bot protection, not authentication; harden later with a signed header via a native
plugin if needed.) Until this rule exists, test against a local/staging origin instead.

## Prerequisites

- **Node 20+** (this project is pinned to Capacitor **7** so it runs on Node 20; Capacitor 8
  requires Node 22). Run `npm install` here first.
- **Android:** Android Studio + SDK, and `ANDROID_HOME` exported
  (e.g. `export ANDROID_HOME=$HOME/Library/Android/sdk`).
- **iOS:** macOS + **full Xcode** (not just Command Line Tools) + **CocoaPods**
  (`brew install cocoapods` or `sudo gem install cocoapods`). The `ios/` project is **not**
  generated yet — see below.

## First-time setup

```bash
cd mobile
npm install

# Android platform is already added. iOS needs Xcode + CocoaPods first:
npx cap add ios
npm run assets            # regenerate icons/splash (also fills the new ios/ project)
```

> **iOS:** full step-by-step (Xcode, CocoaPods, signing, run, submit) is in
> [IOS_SETUP.md](IOS_SETUP.md).

## Day-to-day

```bash
npm run sync             # after any web deploy target / plugin / config change
npm run open:android     # open in Android Studio
npm run open:ios         # open in Xcode
npm run run:android      # build + launch on a connected device/emulator
npm run run:ios          # build + launch on a simulator/device
```

## Testing against a local dev server

Point the shell at your machine instead of prod (use your LAN IP so a device can reach it):

```bash
# repo root, in one terminal:
pnpm dev

# mobile/, in another:
CAP_SERVER_URL="http://192.168.x.x:3000" npm run sync
npm run run:android
```

Local dev is plain HTTP, which Android (cleartext) and iOS (ATS) block by default. Easiest
fix: expose `pnpm dev` over HTTPS with a tunnel (`cloudflared tunnel` / `ngrok http 3000`)
and pass that URL as `CAP_SERVER_URL`. Don't commit cleartext exceptions.

## App identity & assets

- `appId` `ca.pacificdrone.app`, `appName` `Pacific Drone` (in `capacitor.config.ts`).
- Icon/splash source is `assets/logo.svg` → rasterized to `assets/logo.png`. To change the
  artwork, edit the SVG, re-run the rasterize step in the repo plan, then `npm run assets`.
  The current icon is an on-brand **placeholder** (the header drone mark) — replace before
  store submission with final artwork if desired.

## Release

Bump the native version (Android `versionCode`/`versionName`, iOS build/marketing version),
then build a release in Android Studio / Xcode and submit. See the implementation plan
(`/Users/quzhenrong/.claude/plans/`) for the App Store / Play Console checklist and the
reader-mode review notes.
