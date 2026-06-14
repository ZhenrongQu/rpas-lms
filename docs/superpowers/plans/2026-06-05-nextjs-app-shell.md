# Next.js App Shell + Drone HUD UI (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Plan 1 exam engine into a full bilingual (EN/FR) Next.js 15 app with a Drone GCS / Tactical HUD aesthetic — dashboard, exam interface, and results/debrief page.

**Architecture:** Next.js 15 App Router; next-intl middleware routes `/en/…` and `/fr/…`; the existing `examService` singleton (InMemorySessionStore) is shared between API route handlers and server components in-process; all grading stays server-side; Tailwind CSS 3 for utilities, heavy HUD aesthetics via custom CSS in `app/globals.css`.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.5, Tailwind CSS 3.4, next-intl 3, Vitest 2 (existing 44 tests must remain green), Zod (existing).

**Design reference:** `docs/ui-prototype.html` — open in a browser before starting. All CSS class names in this plan match the prototype. Colors: `--cyan: #00d4ff`, `--amber: #ffaa00`, `--green: #00ff88`, `--red: #ff3860`, bg `#060c18`. Fonts: Orbitron (display), Rajdhani (UI), Share Tech Mono (mono data).

**Flow:** `/[locale]` (dashboard) → `/[locale]/exam` (cert selector) → POST `/api/exam` → `/[locale]/exam/[id]` (live exam) → POST `/api/exam/[id]/submit` → `/[locale]/exam/[id]/results`.

---

## File map

```
app/
  layout.tsx                          # root: html/body/fonts/globals.css
  globals.css                         # ALL HUD design tokens + custom CSS classes
  [locale]/
    layout.tsx                        # NextIntlClientProvider + bg-scene + HudHeader
    page.tsx                          # dashboard: sidebar + 8 module cards + launcher link
    exam/
      page.tsx                        # cert-level selector → POST /api/exam → redirect
      [id]/
        page.tsx                      # server wrapper: awaits params → ExamClient
        ExamClient.tsx                # 'use client': full exam state machine
        results/
          page.tsx                    # server: fetches examService.getResult() → debrief
  api/exam/
    route.ts                          # existing (unchanged)
    [id]/
      questions/route.ts              # existing (unchanged)
      answer/route.ts                 # existing (unchanged)
      submit/route.ts                 # existing (unchanged)
      result/route.ts                 # NEW: GET result after submit

src/
  i18n/
    routing.ts                        # defineRouting({locales,defaultLocale})
    request.ts                        # getRequestConfig → load messages JSON
  components/
    layout/
      HudHeader.tsx                   # 'use client': logo, radar SVG, nav tabs, locale switch
    dashboard/
      ModuleCard.tsx                  # server: one subject card with progress bar
      ProgressRing.tsx                # server: SVG ring gauge
      ExamSidebar.tsx                 # server: left sidebar (module list + telemetry)
    exam/
      QManifest.tsx                   # 'use client': dot-grid question navigator
      Timer.tsx                       # 'use client': countdown; calls onExpire at 0
      QuestionCard.tsx                # pure display: stem + options (SINGLE/MULTI)
    results/
      SubjectBreakdown.tsx            # pure display: per-subject bar rows
  lib/exam/
    store.ts                          # MODIFIED: ExamSession gets result?: ExamResult
    service.ts                        # MODIFIED: answer() expiry check; submit() stores result; getExpiresAt(); getResult()
    service.test.ts                   # MODIFIED: 4 new tests (expiry, result storage, getExpiresAt, getResult)

messages/
  en.json
  fr.json
middleware.ts
next.config.ts
tailwind.config.ts
postcss.config.mjs
```

---

## Task 1 — Next.js 15 + Tailwind + next-intl scaffold

**Files:**
- Modify: `package.json`
- Create: `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install packages**

Working directory: `/Users/quzhenrong/rpas-lms`

```bash
pnpm add next@^15.3.0 react@^19.0.0 react-dom@^19.0.0 next-intl@^3.26.0
pnpm add -D @types/react@^19.0.0 @types/react-dom@^19.0.0 tailwindcss@^3.4.0 autoprefixer@^10.4.0 postcss@^8.4.0
```

- [ ] **Step 2: Update `package.json`** — add Next.js scripts, remove `"type": "module"` (conflicts with Next.js)

```json
{
  "name": "rpas-lms",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.3.0",
    "next-intl": "^3.26.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 5: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Update `tsconfig.json`** — add jsx, incremental, Next.js plugin, dom.iterable, messages in include

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "app", "content", "messages", "middleware.ts", "next.config.ts", "tailwind.config.ts"]
}
```

- [ ] **Step 7: Verify existing tests still pass**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test
```

Expected: `44 passed` (same as Plan 1). If any fail, the tsconfig change broke something — revert `tsconfig.json` to the minimal version and re-add Next.js settings one at a time.

- [ ] **Step 8: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add package.json next.config.ts tailwind.config.ts postcss.config.mjs tsconfig.json pnpm-lock.yaml
git -C /Users/quzhenrong/rpas-lms commit -m "chore: add Next.js 15, Tailwind 3, next-intl scaffold"
```

---

## Task 2 — i18n routing + messages + root layouts

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `middleware.ts`
- Create: `messages/en.json`, `messages/fr.json`
- Create: `app/layout.tsx` (root), `app/[locale]/layout.tsx` (locale shell)
- Create: `app/[locale]/page.tsx` (placeholder — replaced in Task 5)

- [ ] **Step 1: Create `src/i18n/routing.ts`**

```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
});
```

- [ ] **Step 2: Create `src/i18n/request.ts`**

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 3: Create `middleware.ts`** (at repo root, next to `package.json`)

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/', '/(en|fr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

- [ ] **Step 4: Create `messages/en.json`**

```json
{
  "nav": {
    "modules": "Modules",
    "exam": "Exam"
  },
  "dashboard": {
    "title": "Mission Modules",
    "subtitle": "Transport Canada · TP-15263 Knowledge Requirements",
    "overallProgress": "Overall Progress",
    "certification": "Advanced Operations",
    "startExam": "Start Exam",
    "telemetry": "Telemetry",
    "missionStatus": "Mission Status",
    "subjectAreas": "Subject Areas",
    "complete": "Complete",
    "inProgress": "In Progress",
    "locked": "Locked"
  },
  "modules": {
    "air-law": "Air Law & Regs",
    "flight-operations": "Flight Operations",
    "human-factors": "Human Factors",
    "meteorology": "Meteorology",
    "navigation": "Navigation",
    "airframes-systems": "Airframes & Systems",
    "radiotelephony": "Radiotelephony",
    "theory-of-flight": "Theory of Flight"
  },
  "moduleId": {
    "air-law": "01",
    "flight-operations": "02",
    "human-factors": "03",
    "meteorology": "04",
    "navigation": "05",
    "airframes-systems": "06",
    "radiotelephony": "07",
    "theory-of-flight": "08"
  },
  "certLevel": {
    "BASIC": "Basic Operations",
    "ADVANCED": "Advanced Operations"
  },
  "examSpecs": {
    "BASIC": "35 questions · 90 min · Pass 65%",
    "ADVANCED": "50 questions · 60 min · Pass 80%"
  },
  "examLaunch": {
    "title": "Initiate Mock Examination",
    "selectLevel": "Select Certification Level",
    "launch": "Launch Exam",
    "launching": "Launching…"
  },
  "exam": {
    "timeRemaining": "Time Remaining",
    "confirmSelection": "Confirm Selection",
    "skip": "Skip",
    "flagForReview": "Flag for Review",
    "submitExam": "Submit Exam",
    "submitting": "Submitting…",
    "question": "Q",
    "of": "of",
    "answered": "answered",
    "loading": "Loading questions…"
  },
  "results": {
    "missionComplete": "Mission Complete",
    "missionFailed": "Mission Failed",
    "score": "Score",
    "correct": "correct",
    "passStatus": "PASS",
    "failStatus": "FAIL",
    "perSubject": "Per-Subject Breakdown",
    "weakAreas": "Weak areas flagged",
    "reviewAnswers": "Review Answers",
    "newMission": "New Mission",
    "notFound": "Result not found. The session may have expired or not been submitted."
  }
}
```

- [ ] **Step 5: Create `messages/fr.json`**

```json
{
  "nav": {
    "modules": "Modules",
    "exam": "Examen"
  },
  "dashboard": {
    "title": "Modules de mission",
    "subtitle": "Transports Canada · Exigences de connaissances TP-15263",
    "overallProgress": "Progression globale",
    "certification": "Opérations avancées",
    "startExam": "Démarrer l'examen",
    "telemetry": "Télémétrie",
    "missionStatus": "État de la mission",
    "subjectAreas": "Domaines",
    "complete": "Terminé",
    "inProgress": "En cours",
    "locked": "Verrouillé"
  },
  "modules": {
    "air-law": "Réglementation aérienne",
    "flight-operations": "Opérations de vol",
    "human-factors": "Facteurs humains",
    "meteorology": "Météorologie",
    "navigation": "Navigation",
    "airframes-systems": "Cellules et systèmes",
    "radiotelephony": "Radiotéléphonie",
    "theory-of-flight": "Théorie du vol"
  },
  "moduleId": {
    "air-law": "01",
    "flight-operations": "02",
    "human-factors": "03",
    "meteorology": "04",
    "navigation": "05",
    "airframes-systems": "06",
    "radiotelephony": "07",
    "theory-of-flight": "08"
  },
  "certLevel": {
    "BASIC": "Opérations de base",
    "ADVANCED": "Opérations avancées"
  },
  "examSpecs": {
    "BASIC": "35 questions · 90 min · Réussite 65 %",
    "ADVANCED": "50 questions · 60 min · Réussite 80 %"
  },
  "examLaunch": {
    "title": "Initier un examen simulé",
    "selectLevel": "Sélectionner le niveau de certification",
    "launch": "Lancer l'examen",
    "launching": "Lancement…"
  },
  "exam": {
    "timeRemaining": "Temps restant",
    "confirmSelection": "Confirmer la sélection",
    "skip": "Passer",
    "flagForReview": "Marquer pour révision",
    "submitExam": "Soumettre l'examen",
    "submitting": "Soumission…",
    "question": "Q",
    "of": "sur",
    "answered": "répondu",
    "loading": "Chargement des questions…"
  },
  "results": {
    "missionComplete": "Mission accomplie",
    "missionFailed": "Mission échouée",
    "score": "Score",
    "correct": "correct",
    "passStatus": "RÉUSSI",
    "failStatus": "ÉCHOUÉ",
    "perSubject": "Résultats par domaine",
    "weakAreas": "Domaines faibles identifiés",
    "reviewAnswers": "Revoir les réponses",
    "newMission": "Nouvelle mission",
    "notFound": "Résultat introuvable. La session a peut-être expiré ou n'a pas été soumise."
  }
}
```

- [ ] **Step 6: Create root `app/layout.tsx`**

This is the Next.js-required root layout. It reads the locale set by next-intl middleware via the `x-next-intl-locale` header and sets `<html lang>`. Fonts are loaded here.

```typescript
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Orbitron, Rajdhani, Share_Tech_Mono } from 'next/font/google';
import './globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '900'],
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  variable: '--font-ui',
  weight: ['300', '400', '500', '600', '700'],
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: '400',
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const locale = headersList.get('x-next-intl-locale') ?? 'en';

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${orbitron.variable} ${rajdhani.variable} ${shareTechMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `app/globals.css`** — just the Tailwind directives for now; full HUD CSS is added in Task 3.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `app/[locale]/layout.tsx`** — providers + background scaffold (no visual yet)

```typescript
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="app">
        <main className="main-content">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 9: Create placeholder `app/[locale]/page.tsx`**

```typescript
export default function DashboardPage() {
  return <div style={{ color: '#00d4ff', padding: 32, fontFamily: 'monospace' }}>PACIFIC DRONE — Plan 2 in progress</div>;
}
```

- [ ] **Step 10: Start dev server and verify routing**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Navigate to `http://localhost:3000`. Expected: redirected to `/en` and see the placeholder text. Navigate to `http://localhost:3000/fr` and see the same. Stop server with Ctrl-C.

- [ ] **Step 11: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/i18n middleware.ts messages app/layout.tsx app/globals.css "app/[locale]"
git -C /Users/quzhenrong/rpas-lms commit -m "feat: add next-intl routing, messages (EN/FR), root and locale layouts"
```

---

## Task 3 — Design tokens CSS + HUD visual structure

**Files:**
- Modify: `app/globals.css` (replace placeholder with full HUD CSS)
- Modify: `app/[locale]/layout.tsx` (add bg-scene + HudHeader placeholder)

- [ ] **Step 1: Replace `app/globals.css`** with full design system

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ═══════════════════════════════
   DESIGN TOKENS
═══════════════════════════════ */
:root {
  --bg-base:       #060c18;
  --bg-deep:       #040912;
  --surface:       rgba(8, 18, 36, 0.82);
  --surface-2:     rgba(12, 24, 48, 0.70);
  --border:        rgba(0, 212, 255, 0.18);
  --border-glow:   rgba(0, 212, 255, 0.55);
  --cyan:          #00d4ff;
  --cyan-dim:      rgba(0, 212, 255, 0.45);
  --cyan-glow:     rgba(0, 212, 255, 0.12);
  --amber:         #ffaa00;
  --amber-dim:     rgba(255, 170, 0, 0.45);
  --green:         #00ff88;
  --red:           #ff3860;
  --text-1:        #e4f2ff;
  --text-2:        #7ab0c8;
  --text-3:        #3e6478;
  --font-display:  var(--font-display, 'Orbitron', monospace);
  --font-ui:       var(--font-ui, 'Rajdhani', sans-serif);
  --font-mono:     var(--font-mono, 'Share Tech Mono', monospace);
}

/* ═══════════════════════════════
   BASE RESET
═══════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  background: var(--bg-base);
  color: var(--text-1);
  font-family: var(--font-ui);
  font-size: 15px;
  letter-spacing: 0.02em;
  overflow: hidden;
}

/* ═══════════════════════════════
   AERIAL BACKGROUND
═══════════════════════════════ */
.bg-scene {
  position: fixed; inset: 0; z-index: 0; overflow: hidden;
}

.bg-scene::before {
  content: '';
  position: absolute; inset: -10%;
  background:
    radial-gradient(ellipse 60% 40% at 20% 30%, #1a3a1a 0%, transparent 60%),
    radial-gradient(ellipse 40% 55% at 70% 20%, #243a1c 0%, transparent 50%),
    radial-gradient(ellipse 50% 30% at 55% 65%, #1c2e1c 0%, transparent 55%),
    radial-gradient(ellipse 35% 45% at 85% 70%, #192b18 0%, transparent 50%),
    radial-gradient(ellipse 70% 25% at 10% 80%, #141e14 0%, transparent 60%),
    radial-gradient(ellipse 30% 60% at 40% 50%, #0e1e2e 0%, transparent 55%),
    radial-gradient(ellipse 80% 80% at 50% 50%, #0a1520 0%, #060c12 100%);
  filter: blur(28px) saturate(1.3);
  transform: scale(1.05);
  animation: terrainDrift 60s ease-in-out infinite alternate;
}

.bg-scene::after {
  content: '';
  position: absolute; inset: 0;
  background:
    linear-gradient(127deg, transparent 30%, rgba(30,55,40,0.3) 30.5%, rgba(30,55,40,0.3) 31%, transparent 31.5%),
    linear-gradient(40deg, transparent 45%, rgba(10,28,42,0.5) 45.3%, rgba(10,28,42,0.5) 46%, transparent 46.3%);
  filter: blur(6px);
}

@keyframes terrainDrift {
  0%   { transform: scale(1.05) translate(0, 0); }
  100% { transform: scale(1.08) translate(-1%, 1%); }
}

/* ═══════════════════════════════
   OVERLAYS
═══════════════════════════════ */
.scanlines {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 2px,
    rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px
  );
}

.grid-overlay {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background-image:
    linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
}

/* ═══════════════════════════════
   APP SHELL
═══════════════════════════════ */
.app {
  position: relative; z-index: 2;
  height: 100vh;
  display: flex; flex-direction: column;
}

.main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* ═══════════════════════════════
   HUD HEADER
═══════════════════════════════ */
.hud-header {
  display: flex; align-items: center;
  padding: 10px 20px;
  background: rgba(4, 10, 22, 0.92);
  border-bottom: 1px solid var(--border);
  gap: 20px;
  backdrop-filter: blur(20px);
  position: relative;
  flex-shrink: 0;
  z-index: 10;
}

.hud-header::after {
  content: '';
  position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan-dim), transparent);
}

.logo-mark { display: flex; align-items: center; gap: 10px; }

.logo-text {
  font-family: var(--font-display);
  font-size: 13px; font-weight: 700;
  letter-spacing: 0.2em; color: var(--cyan);
  text-shadow: 0 0 20px var(--cyan-dim);
  line-height: 1.1;
}

.logo-sub {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-3);
  letter-spacing: 0.15em;
}

.header-divider { width: 1px; height: 32px; background: var(--border); }

.header-stat { display: flex; flex-direction: column; gap: 2px; }

.stat-label {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-3); letter-spacing: 0.2em; text-transform: uppercase;
}

.stat-value { font-family: var(--font-mono); font-size: 13px; color: var(--cyan); }

.header-spacer { flex: 1; }

.cert-badge {
  font-family: var(--font-display); font-size: 10px;
  letter-spacing: 0.18em; padding: 5px 14px;
  border: 1px solid var(--amber-dim); color: var(--amber);
  background: rgba(255,170,0,0.06); border-radius: 2px;
  text-shadow: 0 0 12px var(--amber-dim);
  white-space: nowrap;
}

.nav-tabs { display: flex; gap: 2px; }

.nav-tab {
  font-family: var(--font-ui); font-size: 12px; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase;
  padding: 6px 16px;
  border: 1px solid transparent; background: transparent;
  color: var(--text-3); cursor: pointer; transition: all 0.2s;
  text-decoration: none; display: block; border-radius: 2px;
}

.nav-tab:hover:not(.active) { color: var(--text-2); border-color: rgba(0,212,255,0.08); }

.nav-tab.active {
  border-color: var(--border); color: var(--cyan);
  background: var(--cyan-glow);
}

.locale-switcher { display: flex; gap: 4px; }

.locale-btn {
  font-family: var(--font-mono); font-size: 10px;
  padding: 4px 8px; border: 1px solid var(--border);
  background: transparent; color: var(--text-3);
  cursor: pointer; transition: all 0.2s; border-radius: 2px;
  text-decoration: none;
}

.locale-btn.active { border-color: var(--cyan-dim); color: var(--cyan); background: var(--cyan-glow); }
.locale-btn:hover:not(.active) { border-color: rgba(0,212,255,0.2); color: var(--text-2); }

.status-blip {
  display: inline-block; width: 6px; height: 6px;
  border-radius: 50%; background: var(--green);
  box-shadow: 0 0 6px var(--green);
  animation: blip 2s ease-in-out infinite;
}

@keyframes blip {
  0%,100% { opacity: 1; box-shadow: 0 0 4px var(--green); }
  50% { opacity: 0.4; box-shadow: 0 0 10px var(--green); }
}

/* Radar widget */
.radar-widget { width: 44px; height: 44px; }
.radar-sweep { transform-origin: 22px 22px; animation: sweep 3s linear infinite; }
@keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.radar-blip { animation: radarBlip 3s ease-in-out infinite; }
@keyframes radarBlip { 0%,100% { opacity: 0; } 45%,55% { opacity: 1; } }

/* ═══════════════════════════════
   HUD PANEL (reusable glass card)
═══════════════════════════════ */
.hud-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  backdrop-filter: blur(16px);
  position: relative;
  overflow: hidden;
}

.hud-panel::before, .hud-panel::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  border-color: var(--cyan-dim); border-style: solid;
}
.hud-panel::before { top: 8px; left: 8px; border-width: 1px 0 0 1px; }
.hud-panel::after  { bottom: 8px; right: 8px; border-width: 0 1px 1px 0; }

.hud-panel-glow {
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan-dim), transparent);
}

/* ═══════════════════════════════
   SIDEBAR
═══════════════════════════════ */
.sidebar {
  width: 260px; flex-shrink: 0;
  background: rgba(4, 10, 22, 0.88);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(24px);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.sidebar-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }

.section-label {
  font-family: var(--font-mono); font-size: 9px;
  letter-spacing: 0.25em; color: var(--text-3);
  text-transform: uppercase; margin-bottom: 10px;
  display: flex; align-items: center; gap: 6px;
}
.section-label::before { content: '//'; color: var(--cyan-dim); }

.module-list {
  display: flex; flex-direction: column; gap: 4px;
  flex: 1; overflow-y: auto; padding: 12px 16px;
}
.module-list::-webkit-scrollbar { width: 3px; }
.module-list::-webkit-scrollbar-thumb { background: var(--cyan-dim); border-radius: 2px; }

.module-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border: 1px solid transparent;
  border-radius: 2px; cursor: pointer; transition: all 0.2s;
}
.module-item:hover { background: rgba(0,212,255,0.04); border-color: var(--border); }
.module-item.active { background: var(--cyan-glow); border-color: var(--border-glow); }

.module-icon {
  width: 22px; height: 22px; border: 1px solid;
  border-radius: 2px; display: flex; align-items: center;
  justify-content: center; font-family: var(--font-display);
  font-size: 8px; font-weight: 700; flex-shrink: 0;
}
.module-icon.done   { border-color: var(--green); color: var(--green); background: rgba(0,255,136,0.08); }
.module-icon.active { border-color: var(--cyan); color: var(--cyan); background: var(--cyan-glow); }
.module-icon.locked { border-color: var(--text-3); color: var(--text-3); }

.module-name { font-size: 12px; font-weight: 600; color: var(--text-2); flex: 1; line-height: 1.2; }
.module-item.active .module-name { color: var(--text-1); }
.module-prog { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); }

.telemetry { padding: 14px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.tele-row { display: flex; align-items: center; justify-content: space-between; }
.tele-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); letter-spacing: 0.1em; }
.tele-value { font-family: var(--font-mono); font-size: 12px; color: var(--cyan); }
.tele-bar { height: 3px; background: rgba(0,212,255,0.1); border-radius: 2px; overflow: hidden; }
.tele-bar-fill { height: 100%; background: linear-gradient(90deg, var(--cyan) 0%, rgba(0,212,255,0.6) 100%); border-radius: 2px; }

/* ═══════════════════════════════
   DASHBOARD
═══════════════════════════════ */
.dashboard-body {
  display: flex; height: 100%;
}

.dashboard-content {
  flex: 1; padding: 28px 32px;
  overflow-y: auto; display: flex;
  flex-direction: column; gap: 24px;
}
.dashboard-content::-webkit-scrollbar { width: 4px; }
.dashboard-content::-webkit-scrollbar-thumb { background: var(--cyan-dim); border-radius: 2px; }

.dash-callsign {
  font-family: var(--font-display); font-size: 11px;
  color: var(--amber); letter-spacing: 0.2em;
  border: 1px solid var(--amber-dim); padding: 3px 10px;
  border-radius: 2px; display: inline-block; margin-bottom: 6px;
}

.dash-title {
  font-family: var(--font-display); font-size: 22px;
  font-weight: 700; color: var(--text-1); letter-spacing: 0.08em;
}

.dash-subtitle {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-3); letter-spacing: 0.1em; margin-top: 4px;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.mission-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 18px;
  position: relative; overflow: hidden;
  cursor: pointer; transition: all 0.25s;
  backdrop-filter: blur(12px);
}
.mission-card::before, .mission-card::after {
  content: ''; position: absolute;
  width: 12px; height: 12px;
  border-color: var(--cyan-dim); border-style: solid;
}
.mission-card::before { top: 6px; left: 6px; border-width: 1px 0 0 1px; }
.mission-card::after  { bottom: 6px; right: 6px; border-width: 0 1px 1px 0; }
.mission-card:hover {
  border-color: var(--border-glow);
  background: rgba(0,212,255,0.06);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px var(--border-glow);
}

.card-id { font-family: var(--font-mono); font-size: 9px; color: var(--text-3); letter-spacing: 0.25em; margin-bottom: 8px; }
.card-icon { font-size: 22px; margin-bottom: 10px; }
.card-name { font-size: 13px; font-weight: 700; color: var(--text-1); letter-spacing: 0.04em; line-height: 1.3; margin-bottom: 8px; }
.card-progress { display: flex; align-items: center; gap: 8px; }
.prog-bar { flex: 1; height: 2px; background: rgba(255,255,255,0.08); border-radius: 1px; }
.prog-fill { height: 100%; border-radius: 1px; background: var(--cyan); }
.prog-pct { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); white-space: nowrap; }

.bottom-panel { display: flex; gap: 16px; align-items: stretch; }

.exam-launcher {
  flex: 1; padding: 22px 28px;
}

.launcher-title {
  font-family: var(--font-display); font-size: 14px;
  font-weight: 600; color: var(--text-1); letter-spacing: 0.1em; margin-bottom: 6px;
}
.launcher-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); margin-bottom: 18px; line-height: 1.6; }
.launcher-meta a { color: var(--cyan); text-decoration: none; }

.btn-launch {
  font-family: var(--font-display); font-size: 11px; font-weight: 700;
  letter-spacing: 0.2em; padding: 11px 28px;
  background: var(--cyan-glow); border: 1px solid var(--cyan);
  color: var(--cyan); cursor: pointer; transition: all 0.2s;
  text-transform: uppercase; border-radius: 2px;
  text-decoration: none; display: inline-block;
}
.btn-launch:hover {
  background: rgba(0,212,255,0.18);
  box-shadow: 0 0 24px rgba(0,212,255,0.3);
}

.overall-card { min-width: 200px; flex-shrink: 0; padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.overall-label { font-family: var(--font-mono); font-size: 9px; color: var(--text-3); letter-spacing: 0.2em; text-align: center; line-height: 1.6; }

/* ═══════════════════════════════
   EXAM INTERFACE
═══════════════════════════════ */
.exam-view { display: flex; height: 100%; }

.q-manifest {
  width: 90px; flex-shrink: 0;
  background: rgba(4, 10, 22, 0.90);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(20px);
  padding: 14px 10px;
  display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto;
}
.q-manifest::-webkit-scrollbar { width: 2px; }
.q-manifest::-webkit-scrollbar-thumb { background: var(--cyan-dim); }

.q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

.q-dot {
  width: 30px; height: 30px;
  border: 1px solid var(--border); border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 9px; color: var(--text-3);
  cursor: pointer; transition: all 0.15s;
}
.q-dot:hover { border-color: var(--cyan-dim); color: var(--text-2); }
.q-dot.answered { border-color: var(--cyan-dim); color: var(--cyan); background: var(--cyan-glow); }
.q-dot.current  { border-color: var(--cyan); color: var(--cyan); background: rgba(0,212,255,0.15); box-shadow: 0 0 8px rgba(0,212,255,0.3); }
.q-dot.flagged  { border-color: var(--amber-dim); color: var(--amber); }

.exam-main {
  flex: 1; padding: 28px 36px;
  overflow-y: auto; display: flex;
  flex-direction: column; gap: 20px;
}
.exam-main::-webkit-scrollbar { width: 4px; }
.exam-main::-webkit-scrollbar-thumb { background: var(--cyan-dim); border-radius: 2px; }

.exam-topbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.q-counter { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.q-counter span { font-size: 18px; color: var(--text-1); font-family: var(--font-display); }
.subject-tag {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.15em;
  padding: 3px 10px; border-radius: 1px;
  border: 1px solid rgba(0,212,255,0.25);
  color: var(--cyan); background: var(--cyan-glow); text-transform: uppercase;
}

.exam-timer {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 3px; backdrop-filter: blur(8px);
}
.timer-label { font-family: var(--font-mono); font-size: 9px; color: var(--text-3); letter-spacing: 0.2em; white-space: nowrap; }
.timer-display { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--cyan); letter-spacing: 0.1em; text-shadow: 0 0 20px rgba(0,212,255,0.5); }
.timer-display.warning { color: var(--amber); text-shadow: 0 0 20px rgba(255,170,0,0.5); animation: timerBlink 1s ease-in-out infinite; }
@keyframes timerBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
.timer-bar { flex: 1; height: 2px; background: rgba(0,212,255,0.1); border-radius: 1px; overflow: hidden; }
.timer-fill { height: 100%; background: linear-gradient(90deg, var(--cyan), rgba(0,212,255,0.4)); border-radius: 1px; transition: width 1s linear; }
.timer-fill.warning { background: linear-gradient(90deg, var(--amber), rgba(255,170,0,0.4)); }

.question-card { padding: 28px; }

.q-stem { font-size: 15px; font-weight: 500; color: var(--text-1); line-height: 1.65; margin-top: 6px; }
.q-stem strong { color: var(--cyan); font-weight: 600; }

.options { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }

.option {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 18px; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 3px; cursor: pointer; transition: all 0.2s;
}
.option:hover { border-color: rgba(0,212,255,0.25); background: rgba(0,212,255,0.04); }
.option.selected { border-color: var(--cyan); background: var(--cyan-glow); }
.option.answered { cursor: default; }

.option-letter {
  width: 26px; height: 26px; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 10px; font-weight: 700;
  color: var(--text-3); transition: all 0.2s;
}
.option.selected .option-letter { border-color: var(--cyan); color: var(--cyan); background: rgba(0,212,255,0.15); }

.option-text { font-size: 14px; color: var(--text-2); line-height: 1.5; padding-top: 3px; transition: color 0.2s; }
.option.selected .option-text { color: var(--text-1); }

.action-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.btn-confirm {
  font-family: var(--font-display); font-size: 11px; font-weight: 700;
  letter-spacing: 0.18em; padding: 11px 32px;
  background: var(--cyan-glow); border: 1px solid var(--cyan);
  color: var(--cyan); cursor: pointer; transition: all 0.2s; border-radius: 2px;
}
.btn-confirm:hover:not(:disabled) { background: rgba(0,212,255,0.16); box-shadow: 0 0 20px rgba(0,212,255,0.25); }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-skip {
  font-family: var(--font-ui); font-size: 12px; font-weight: 600;
  letter-spacing: 0.1em; padding: 11px 20px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-3); cursor: pointer; transition: all 0.2s; border-radius: 2px;
}
.btn-skip:hover { border-color: rgba(255,255,255,0.15); color: var(--text-2); }

.btn-flag {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.15em;
  padding: 9px 16px; border: 1px solid var(--border);
  background: transparent; color: var(--text-3);
  cursor: pointer; transition: all 0.2s; border-radius: 2px;
}
.btn-flag:hover, .btn-flag.flagged { border-color: var(--amber-dim); color: var(--amber); background: rgba(255,170,0,0.05); }

.btn-submit {
  font-family: var(--font-display); font-size: 10px; font-weight: 700;
  letter-spacing: 0.18em; padding: 11px 24px;
  background: transparent; border: 1px solid rgba(255,56,96,0.4);
  color: var(--red); cursor: pointer; transition: all 0.2s; border-radius: 2px;
  margin-left: auto;
}
.btn-submit:hover:not(:disabled) { background: rgba(255,56,96,0.1); box-shadow: 0 0 16px rgba(255,56,96,0.2); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.exam-loading { display: flex; align-items: center; justify-content: center; height: 100%; font-family: var(--font-mono); color: var(--cyan); font-size: 14px; letter-spacing: 0.15em; }

/* ═══════════════════════════════
   RESULTS PAGE
═══════════════════════════════ */
.results-view {
  display: flex; flex-direction: column;
  padding: 32px 40px; overflow-y: auto;
  gap: 24px; align-items: center;
}
.results-view::-webkit-scrollbar { width: 4px; }
.results-view::-webkit-scrollbar-thumb { background: var(--cyan-dim); border-radius: 2px; }

.result-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }

.result-status {
  font-family: var(--font-display); font-size: 26px;
  font-weight: 900; letter-spacing: 0.25em; text-transform: uppercase;
}
.result-status.pass { color: var(--green); text-shadow: 0 0 32px rgba(0,255,136,0.5); animation: passGlow 2s ease-in-out infinite alternate; }
.result-status.fail { color: var(--red); text-shadow: 0 0 30px rgba(255,56,96,0.4); }
@keyframes passGlow {
  0%   { text-shadow: 0 0 20px rgba(0,255,136,0.4); }
  100% { text-shadow: 0 0 40px rgba(0,255,136,0.7); }
}

.result-code { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); letter-spacing: 0.2em; }

.result-score-row { display: flex; gap: 20px; width: 100%; max-width: 780px; }

.score-gauge-card {
  min-width: 200px; padding: 28px; display: flex;
  flex-direction: column; align-items: center; gap: 16px;
}

.big-pct { font-family: var(--font-display); font-size: 32px; font-weight: 900; color: var(--green); }
.big-pct.fail { color: var(--red); }
.big-pct-sub { font-family: var(--font-mono); font-size: 9px; color: var(--text-3); }
.score-detail { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); text-align: center; line-height: 1.6; }
.score-detail strong { color: var(--green); font-size: 18px; }
.score-detail strong.fail { color: var(--red); }

.breakdown-card { flex: 1; padding: 24px; }
.breakdown-title { font-family: var(--font-mono); font-size: 9px; color: var(--text-3); letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 18px; }

.subject-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.subj-name { font-size: 12px; font-weight: 600; color: var(--text-2); width: 130px; flex-shrink: 0; }
.subj-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
.subj-fill { height: 100%; border-radius: 2px; }
.subj-fill.good { background: linear-gradient(90deg, var(--green), rgba(0,255,136,0.5)); }
.subj-fill.warn { background: linear-gradient(90deg, var(--amber), rgba(255,170,0,0.5)); }
.subj-fill.poor { background: linear-gradient(90deg, var(--red), rgba(255,56,96,0.5)); }
.subj-score { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); white-space: nowrap; }

.weak-areas { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); }
.weak-areas span { color: var(--amber); }

.result-actions { display: flex; gap: 12px; }

.btn-review {
  font-family: var(--font-display); font-size: 10px; font-weight: 700;
  letter-spacing: 0.18em; padding: 12px 28px;
  background: transparent; border: 1px solid var(--border-glow);
  color: var(--cyan); cursor: pointer; transition: all 0.2s; border-radius: 2px;
  text-decoration: none;
}
.btn-review:hover { background: var(--cyan-glow); box-shadow: 0 0 20px rgba(0,212,255,0.2); }

.btn-retry {
  font-family: var(--font-display); font-size: 10px; font-weight: 700;
  letter-spacing: 0.18em; padding: 12px 28px;
  background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.4);
  color: var(--green); cursor: pointer; transition: all 0.2s; border-radius: 2px;
  text-decoration: none;
}
.btn-retry:hover { background: rgba(0,255,136,0.18); box-shadow: 0 0 20px rgba(0,255,136,0.2); }

/* ═══════════════════════════════
   EXAM LAUNCH PAGE
═══════════════════════════════ */
.exam-launch-page {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%; gap: 32px; padding: 40px;
}

.cert-cards { display: flex; gap: 20px; }

.cert-card {
  width: 260px; padding: 28px; cursor: pointer;
  transition: all 0.2s; border-radius: 4px;
  position: relative; overflow: hidden;
}
.cert-card::before, .cert-card::after {
  content: ''; position: absolute;
  width: 16px; height: 16px;
  border-color: var(--cyan-dim); border-style: solid;
}
.cert-card::before { top: 8px; left: 8px; border-width: 1px 0 0 1px; }
.cert-card::after  { bottom: 8px; right: 8px; border-width: 0 1px 1px 0; }
.cert-card:hover { border-color: var(--border-glow); transform: translateY(-3px); }
.cert-card.selected { border-color: var(--cyan); background: rgba(0,212,255,0.10); }

.cert-card-level {
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  color: var(--cyan); letter-spacing: 0.1em; margin-bottom: 10px;
}
.cert-card-specs { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); line-height: 1.8; }
```

- [ ] **Step 2: Update `app/[locale]/layout.tsx`** — add background layers

```typescript
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import HudHeader from '@/components/layout/HudHeader';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="bg-scene" />
      <div className="scanlines" />
      <div className="grid-overlay" />
      <div className="app">
        <HudHeader locale={locale} />
        <main className="main-content">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
```

Note: `HudHeader` is created in Task 4. For now, create a stub `src/components/layout/HudHeader.tsx`:

```typescript
export default function HudHeader({ locale }: { locale: string }) {
  return (
    <header className="hud-header">
      <div className="logo-mark">
        <div className="logo-text">PACIFIC DRONE</div>
      </div>
      <div className="header-spacer" />
    </header>
  );
}
```

- [ ] **Step 3: Start dev server and verify background renders**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Open `http://localhost:3000/en`. Expected: dark navy background with blurred aerial green terrain, scanline texture, grid overlay, and a dark HUD header strip. Stop server.

- [ ] **Step 4: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add app/globals.css "app/[locale]/layout.tsx" src/components/layout/HudHeader.tsx
git -C /Users/quzhenrong/rpas-lms commit -m "feat: add HUD design tokens, aerial background, HudHeader stub"
```

---

## Task 4 — HUD Header component

**Files:**
- Modify: `src/components/layout/HudHeader.tsx` (replace stub with full implementation)

- [ ] **Step 1: Write `src/components/layout/HudHeader.tsx`**

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function HudHeader({ locale }: { locale: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const isModules = pathname === `/${locale}` || pathname === `/${locale}/`;
  const isExam = pathname.startsWith(`/${locale}/exam`);
  const otherLocale = locale === 'en' ? 'fr' : 'en';

  // Build same path in the other locale by replacing the locale prefix
  const otherLocalePath = pathname.replace(new RegExp(`^/${locale}`), `/${otherLocale}`);

  return (
    <header className="hud-header">
      {/* Logo */}
      <div className="logo-mark">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" style={{ filter: 'drop-shadow(0 0 8px #00d4ff)' }}>
          <line x1="20" y1="20" x2="8"  y2="8"  stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="8"  stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="8"  y2="32" stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="32" stroke="#00d4ff" strokeWidth="1.5"/>
          <circle cx="8"  cy="8"  r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="32" cy="8"  r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="8"  cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="32" cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <rect x="15" y="15" width="10" height="10" rx="2" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1"/>
          <circle cx="20" cy="20" r="2" fill="#00d4ff"/>
        </svg>
        <div>
          <div className="logo-text">PACIFIC DRONE</div>
          <div className="logo-sub">Transport Canada · TP-15263</div>
        </div>
      </div>

      <div className="header-divider" />

      <div className="header-stat">
        <div className="stat-label">Status</div>
        <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-blip" />
          ACTIVE
        </div>
      </div>

      <div className="header-spacer" />

      {/* Radar widget */}
      <div className="radar-widget">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="20" stroke="rgba(0,212,255,0.12)" strokeWidth="1" fill="none"/>
          <circle cx="22" cy="22" r="13" stroke="rgba(0,212,255,0.08)" strokeWidth="1" fill="none"/>
          <circle cx="22" cy="22" r="6"  stroke="rgba(0,212,255,0.10)" strokeWidth="1" fill="none"/>
          <line x1="2" y1="22" x2="42" y2="22" stroke="rgba(0,212,255,0.06)" strokeWidth="1"/>
          <line x1="22" y1="2" x2="22" y2="42" stroke="rgba(0,212,255,0.06)" strokeWidth="1"/>
          <g className="radar-sweep">
            <line x1="22" y1="22" x2="22" y2="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1"/>
            <path d="M22 22 L22 2 A20 20 0 0 1 38 32 Z" fill="rgba(0,212,255,0.05)"/>
          </g>
          <circle cx="30" cy="14" r="2" fill="#00d4ff" className="radar-blip"/>
        </svg>
      </div>

      <div className="cert-badge">ADVANCED OPS</div>

      {/* Nav tabs */}
      <nav className="nav-tabs">
        <Link href={`/${locale}`} className={`nav-tab${isModules ? ' active' : ''}`}>
          {t('modules')}
        </Link>
        <Link href={`/${locale}/exam`} className={`nav-tab${isExam ? ' active' : ''}`}>
          {t('exam')}
        </Link>
      </nav>

      {/* Locale switcher */}
      <div className="locale-switcher">
        <span className={`locale-btn${locale === 'en' ? ' active' : ''}`}>EN</span>
        <Link href={otherLocalePath} className={`locale-btn${locale === 'fr' ? ' active' : ''}`}>
          FR
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify header in browser**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Open `http://localhost:3000/en`. Expected: full HUD header — drone SVG logo, radar widget with sweep animation, status blip, ADVANCED OPS badge, MODULES/EXAM tabs, EN/FR switcher. Click FR to switch to `/fr`. Click EN to return. Stop server.

- [ ] **Step 3: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/components/layout/HudHeader.tsx
git -C /Users/quzhenrong/rpas-lms commit -m "feat: HUD header with drone logo, radar widget, nav tabs, locale switcher"
```

---

## Task 5 — Dashboard page

**Files:**
- Create: `src/components/dashboard/ModuleCard.tsx`
- Create: `src/components/dashboard/ProgressRing.tsx`
- Create: `src/components/dashboard/ExamSidebar.tsx`
- Modify: `app/[locale]/page.tsx` (replace placeholder)

- [ ] **Step 1: Create `src/components/dashboard/ProgressRing.tsx`**

```typescript
interface Props {
  pct: number; // 0..100
  size?: number;
  label?: string;
  sublabel?: string;
}

export default function ProgressRing({ pct, size = 96, label, sublabel }: Props) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#00d4ff" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ filter: 'drop-shadow(0 0 6px #00d4ff)', transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {label && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: size > 100 ? 26 : 18, fontWeight: 900, color: 'var(--cyan)' }}>
            {label}
          </div>
        )}
        {sublabel && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/dashboard/ModuleCard.tsx`**

```typescript
import { useTranslations } from 'next-intl';

const MODULE_ICONS: Record<string, string> = {
  'air-law': '⚖️',
  'flight-operations': '✈️',
  'human-factors': '🧠',
  'meteorology': '⛅',
  'navigation': '🧭',
  'airframes-systems': '⚙️',
  'radiotelephony': '📡',
  'theory-of-flight': '🌪️',
};

interface Props {
  moduleId: string;
  progress?: number; // 0..100
}

export default function ModuleCard({ moduleId, progress = 0 }: Props) {
  const t = useTranslations();
  const idx = String(['air-law','flight-operations','human-factors','meteorology','navigation','airframes-systems','radiotelephony','theory-of-flight'].indexOf(moduleId) + 1).padStart(2, '0');

  return (
    <div className="mission-card">
      <div className="card-id">// MODULE {idx}</div>
      <div className="card-icon">{MODULE_ICONS[moduleId] ?? '🔹'}</div>
      <div className="card-name">{t(`modules.${moduleId}`)}</div>
      <div className="card-progress">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="prog-pct">{progress}%</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/dashboard/ExamSidebar.tsx`**

```typescript
import { getTranslations } from 'next-intl/server';
import { MODULE_IDS } from '@/lib/content/types';

export default async function ExamSidebar() {
  const t = await getTranslations();

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="section-label">{t('dashboard.missionStatus')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="tele-row">
            <span className="tele-label">{t('dashboard.overallProgress')}</span>
            <span className="tele-value">0%</span>
          </div>
          <div className="tele-bar"><div className="tele-bar-fill" style={{ width: '0%' }} /></div>
        </div>
      </div>

      <div className="module-list">
        <div className="section-label" style={{ marginBottom: 8 }}>{t('dashboard.subjectAreas')}</div>
        {MODULE_IDS.map((id) => (
          <div key={id} className="module-item">
            <div className="module-icon locked">○</div>
            <div className="module-name">{t(`modules.${id}`)}</div>
            <div className="module-prog">0%</div>
          </div>
        ))}
      </div>

      <div className="telemetry">
        <div className="section-label" style={{ marginBottom: 4 }}>{t('dashboard.telemetry')}</div>
        <div className="tele-row">
          <span className="tele-label">Mock exams taken</span>
          <span className="tele-value">—</span>
        </div>
        <div className="tele-row">
          <span className="tele-label">Best score</span>
          <span className="tele-value">—</span>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Write `app/[locale]/page.tsx`** (replace placeholder)

```typescript
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MODULE_IDS } from '@/lib/content/types';
import ModuleCard from '@/components/dashboard/ModuleCard';
import ExamSidebar from '@/components/dashboard/ExamSidebar';
import ProgressRing from '@/components/dashboard/ProgressRing';

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations();

  return (
    <div className="dashboard-body">
      <ExamSidebar />

      <div className="dashboard-content">
        {/* Header */}
        <div>
          <div className="dash-callsign">{t('dashboard.certification')}</div>
          <div className="dash-title">{t('dashboard.title')}</div>
          <div className="dash-subtitle">// {t('dashboard.subtitle')}</div>
        </div>

        {/* Module grid */}
        <div className="modules-grid">
          {MODULE_IDS.map((id) => (
            <ModuleCard key={id} moduleId={id} progress={0} />
          ))}
        </div>

        {/* Bottom: exam launcher + overall ring */}
        <div className="bottom-panel">
          <div className="hud-panel exam-launcher">
            <div className="hud-panel-glow" />
            <div className="launcher-title">{t('examLaunch.title')}</div>
            <div className="launcher-meta">
              Advanced Operations ·{' '}
              <span style={{ color: 'var(--cyan)' }}>50 questions</span> ·{' '}
              <span style={{ color: 'var(--cyan)' }}>60 min</span> · Pass threshold:{' '}
              <span style={{ color: 'var(--cyan)' }}>80%</span>
            </div>
            <Link href={`/${locale}/exam`} className="btn-launch">
              ▶ {t('dashboard.startExam')}
            </Link>
          </div>

          <div className="hud-panel overall-card">
            <ProgressRing pct={0} size={120} label="0%" sublabel="COMPLETE" />
            <div className="overall-label">// {t('dashboard.overallProgress')}<br/>{t('dashboard.certification').toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify dashboard in browser**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Open `http://localhost:3000/en`. Expected: left sidebar with 8 locked modules, main area with 8 mission cards in a 4-column grid, bottom panel with launcher + progress ring. All text in English. Navigate to `/fr` — text switches to French. Stop server.

- [ ] **Step 6: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/components/dashboard "app/[locale]/page.tsx"
git -C /Users/quzhenrong/rpas-lms commit -m "feat: dashboard page with module grid, sidebar, progress ring, exam launcher"
```

---

## Task 6 — ExamService logic additions + tests

**Goal:** Add `getExpiresAt()`, `getResult()`, expiry check in `answer()`, result storage in `submit()`. These methods are required by Tasks 8 (exam page) and 9 (results page). Also add the `GET /api/exam/[id]/result` route.

**Files:**
- Modify: `src/lib/exam/store.ts` (add `result?` to ExamSession)
- Modify: `src/lib/exam/service.ts` (4 changes)
- Modify: `src/lib/exam/service.test.ts` (4 new test cases)
- Create: `app/api/exam/[id]/result/route.ts`

- [ ] **Step 1: Write 4 failing tests** — append to `src/lib/exam/service.test.ts`

First, read the current test file to understand its structure, then append these 4 test cases inside the existing `describe` block (or top-level if no describe):

```typescript
// ─── New tests for Task 6 ───
import { vi } from 'vitest';

// (these go inside the describe block, or at top level if the file uses standalone it() calls)

it('answer() returns false after session expiresAt', async () => {
  const store = new InMemorySessionStore();
  const t0 = Date.now();
  const nowFn = vi.fn()
    .mockReturnValueOnce(t0)          // used by createMock
    .mockReturnValue(t0 + 200 * 60_000); // used by answer() — 200 min later
  const service = new ExamService(store, nowFn, loadQuestionBank());
  const { sessionId } = await service.createMock('BASIC', 'EN', 1);
  const questions = await service.getPublicQuestions(sessionId);
  const firstId = questions![0].id;
  const ok = await service.answer(sessionId, firstId, ['a']);
  expect(ok).toBe(false);
});

it('answer() accepts submissions before expiresAt', async () => {
  const store = new InMemorySessionStore();
  const t0 = Date.now();
  const nowFn = vi.fn().mockReturnValue(t0); // never advances
  const service = new ExamService(store, nowFn, loadQuestionBank());
  const { sessionId } = await service.createMock('BASIC', 'EN', 1);
  const questions = await service.getPublicQuestions(sessionId);
  const firstId = questions![0].id;
  const ok = await service.answer(sessionId, firstId, ['a']);
  expect(ok).toBe(true);
});

it('getExpiresAt() returns the session expiresAt', async () => {
  const store = new InMemorySessionStore();
  const service = new ExamService(store, Date.now, loadQuestionBank());
  const { sessionId, expiresAt } = await service.createMock('BASIC', 'EN', 1);
  const retrieved = await service.getExpiresAt(sessionId);
  expect(retrieved).toBe(expiresAt);
});

it('getResult() is null before submit, non-null after submit', async () => {
  const store = new InMemorySessionStore();
  const service = new ExamService(store, Date.now, loadQuestionBank());
  const { sessionId } = await service.createMock('BASIC', 'EN', 1);

  const before = await service.getResult(sessionId);
  expect(before).toBeNull();

  await service.submit(sessionId);
  const after = await service.getResult(sessionId);
  expect(after).not.toBeNull();
  expect(after).toHaveProperty('total');
  expect(after).toHaveProperty('passed');
  expect(after).toHaveProperty('bySubject');
});
```

- [ ] **Step 2: Run tests — expect 4 failures**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test
```

Expected: 44 pass, 4 fail (the new tests fail because the methods don't exist yet).

- [ ] **Step 3: Modify `src/lib/exam/store.ts`** — add `result?` to ExamSession

Add import and field:

```typescript
import type { ExamCertLevel, Locale } from "../content/types";
import type { ExamResult } from "./score";   // ← add this import

export interface ExamSession {
  id: string;
  certLevel: ExamCertLevel;
  locale: Locale;
  questionIds: string[];
  startedAt: number;
  expiresAt: number;
  answers: Record<string, string[]>;
  submitted: boolean;
  result?: ExamResult;                        // ← add this field
}

// InMemorySessionStore stays unchanged
```

- [ ] **Step 4: Modify `src/lib/exam/service.ts`** — add methods and fix answer()/submit()

Replace the full file content:

```typescript
import { randomUUID } from "node:crypto";
import { loadQuestionBank } from "../content/loadBank";
import { EXAM_SPECS } from "./config";
import { generateExam } from "./generate";
import { mulberry32 } from "./rng";
import { scoreExam, type ExamResult } from "./score";
import { toPublicQuestion, type PublicQuestion } from "./serialize";
import type { SessionStore, ExamSession } from "./store";
import type { ExamCertLevel, Locale, Question, QuestionBank } from "../content/types";

export interface CreatedExam {
  sessionId: string;
  expiresAt: number;
  total: number;
}

export class ExamService {
  constructor(
    private store: SessionStore,
    private now: () => number = Date.now,
    private bank: QuestionBank = loadQuestionBank(),
  ) {}

  async createMock(
    certLevel: ExamCertLevel,
    locale: Locale,
    seed: number = Math.floor(Math.random() * 1e9),
  ): Promise<CreatedExam> {
    const spec = EXAM_SPECS[certLevel];
    const questions = generateExam(certLevel, spec.totalQuestions, mulberry32(seed), this.bank);
    const startedAt = this.now();
    const session: ExamSession = {
      id: randomUUID(),
      certLevel,
      locale,
      questionIds: questions.map((q) => q.id),
      startedAt,
      expiresAt: startedAt + spec.timeLimitMinutes * 60_000,
      answers: {},
      submitted: false,
    };
    await this.store.create(session);
    return { sessionId: session.id, expiresAt: session.expiresAt, total: questions.length };
  }

  private byId(id: string): Question | undefined {
    return this.bank.questions.find((q) => q.id === id);
  }

  async getPublicQuestions(sessionId: string): Promise<PublicQuestion[] | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    return session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q))
      .map((q) => toPublicQuestion(q, session.locale));
  }

  /** Returns false if session missing, already submitted, expired, or question not in session. */
  async answer(sessionId: string, questionId: string, selected: string[]): Promise<boolean> {
    const session = await this.store.get(sessionId);
    if (!session || session.submitted) return false;
    if (session.expiresAt < this.now()) return false;          // expiry enforcement
    if (!session.questionIds.includes(questionId)) return false;
    session.answers[questionId] = selected;
    await this.store.update(session);
    return true;
  }

  /** Always submittable (even after expiry — timer expiry auto-submits client-side). Stores result. */
  async submit(sessionId: string): Promise<ExamResult | null> {
    const session = await this.store.get(sessionId);
    if (!session) return null;
    session.submitted = true;
    const questions = session.questionIds
      .map((id) => this.byId(id))
      .filter((q): q is Question => Boolean(q));
    const result = scoreExam(questions, session.answers, EXAM_SPECS[session.certLevel].passThreshold);
    session.result = result;                                    // store result for results page
    await this.store.update(session);
    return result;
  }

  /** For server components: return expiresAt to initialize client timer. */
  async getExpiresAt(sessionId: string): Promise<number | null> {
    const session = await this.store.get(sessionId);
    return session?.expiresAt ?? null;
  }

  /** For results page: return stored result (null if not submitted yet). */
  async getResult(sessionId: string): Promise<ExamResult | null> {
    const session = await this.store.get(sessionId);
    return session?.result ?? null;
  }
}
```

- [ ] **Step 5: Create `app/api/exam/[id]/result/route.ts`**

```typescript
import { examService } from "../../../../../src/lib/exam/instance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const result = await examService.getResult(id);
  if (result === null) {
    return Response.json({ error: "not submitted or session not found" }, { status: 404 });
  }
  return Response.json(result, { status: 200 });
}
```

- [ ] **Step 6: Run all tests — expect 48 passing**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test
```

Expected: `48 passed` (44 original + 4 new). If any of the original 44 fail, the `answer()` expiry logic is wrong — double-check that `this.now()` is called AFTER the session is retrieved, not during session creation.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/lib/exam/store.ts src/lib/exam/service.ts src/lib/exam/service.test.ts "app/api/exam/[id]/result"
git -C /Users/quzhenrong/rpas-lms commit -m "feat: add getExpiresAt/getResult, expiry enforcement in answer(), result storage in submit()"
```

---

## Task 7 — Exam launch page

**Files:**
- Create: `app/[locale]/exam/page.tsx`

- [ ] **Step 1: Create `app/[locale]/exam/page.tsx`**

This is a client component (needs state for selected cert level + fetch for POST /api/exam).

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

type CertLevel = 'BASIC' | 'ADVANCED';

export default function ExamLaunchPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<CertLevel>('ADVANCED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function launch() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certLevel: selected, locale: locale.toUpperCase() }),
      });
      if (!res.ok) throw new Error('Failed to create exam session');
      const { sessionId } = await res.json();
      router.push(`/${locale}/exam/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setLoading(false);
    }
  }

  return (
    <div className="exam-launch-page">
      <div style={{ textAlign: 'center' }}>
        <div className="dash-callsign" style={{ display: 'inline-block' }}>
          {t('examLaunch.title').toUpperCase()}
        </div>
        <div className="dash-title" style={{ marginTop: 8 }}>{t('examLaunch.selectLevel')}</div>
      </div>

      <div className="cert-cards">
        {(['BASIC', 'ADVANCED'] as CertLevel[]).map((level) => (
          <div
            key={level}
            className={`hud-panel cert-card${selected === level ? ' selected' : ''}`}
            onClick={() => setSelected(level)}
          >
            <div className="cert-card-level">{t(`certLevel.${level}`)}</div>
            <div className="cert-card-specs">{t(`examSpecs.${level}`)}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <button className="btn-launch" onClick={launch} disabled={loading}>
        {loading ? t('examLaunch.launching') : `▶ ${t('examLaunch.launch')}`}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the launch flow**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Open `http://localhost:3000/en/exam`. Expected: two cert-level cards (BASIC / ADVANCED), click ADVANCED (selected state — cyan border), click "▶ Launch Exam" → should redirect to `/en/exam/[uuid]` (a 404 page is fine — that route is built in Task 8). Stop server.

- [ ] **Step 3: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add "app/[locale]/exam/page.tsx"
git -C /Users/quzhenrong/rpas-lms commit -m "feat: exam launch page with cert-level selector"
```

---

## Task 8 — Exam question interface

**Files:**
- Create: `src/components/exam/QManifest.tsx`
- Create: `src/components/exam/Timer.tsx`
- Create: `src/components/exam/QuestionCard.tsx`
- Create: `app/[locale]/exam/[id]/ExamClient.tsx`
- Create: `app/[locale]/exam/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/exam/QManifest.tsx`**

```typescript
'use client';

import { useTranslations } from 'next-intl';
import type { PublicQuestion } from '@/lib/exam/serialize';

interface Props {
  questions: PublicQuestion[];
  currentIdx: number;
  confirmed: Record<string, string[]>;
  flagged: Set<string>;
  onSelect: (idx: number) => void;
}

export default function QManifest({ questions, currentIdx, confirmed, flagged, onSelect }: Props) {
  const t = useTranslations('exam');

  return (
    <div className="q-manifest">
      <div className="section-label" style={{ fontSize: 8, marginBottom: 6 }}>// Q-MAP</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 8 }}>
        {Object.keys(confirmed).length}/{questions.length} {t('answered')}
      </div>
      <div className="q-grid">
        {questions.map((q, i) => {
          const isAnswered = Boolean(confirmed[q.id]);
          const isFlagged = flagged.has(q.id);
          const isCurrent = i === currentIdx;
          let cls = 'q-dot';
          if (isCurrent) cls += ' current';
          else if (isFlagged) cls += ' flagged';
          else if (isAnswered) cls += ' answered';
          return (
            <div key={q.id} className={cls} onClick={() => onSelect(i)} title={q.moduleId}>
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/exam/Timer.tsx`**

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  expiresAt: number;
  totalMs: number;    // for progress bar denominator (spec time limit in ms)
  onExpire: () => void;
}

export default function Timer({ expiresAt, totalMs, onExpire }: Props) {
  const t = useTranslations('exam');
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));
  const fired = useRef(false);
  const stableExpire = useRef(onExpire);
  stableExpire.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r === 0 && !fired.current) {
        fired.current = true;
        stableExpire.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const pct = Math.min(100, (remaining / totalMs) * 100);
  const warn = remaining < 15 * 60_000;

  return (
    <div className="exam-timer">
      <div className="timer-label">{t('timeRemaining')}</div>
      <div className={`timer-display${warn ? ' warning' : ''}`}>{fmt(remaining)}</div>
      <div className="timer-bar">
        <div className={`timer-fill${warn ? ' warning' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/exam/QuestionCard.tsx`**

```typescript
'use client';

import type { PublicQuestion } from '@/lib/exam/serialize';

interface Props {
  question: PublicQuestion;
  pendingSelection: string[];
  isConfirmed: boolean;
  onSelect: (optionId: string) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuestionCard({ question, pendingSelection, isConfirmed, onSelect }: Props) {
  return (
    <div className="hud-panel question-card">
      <div className="hud-panel-glow" />
      <div className="q-stem" dangerouslySetInnerHTML={{ __html: question.stem }} />
      {question.type === 'MULTI' && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', marginTop: 8 }}>
          Select {question.selectCount}
        </div>
      )}
      <div className="options">
        {question.options.map((opt, i) => {
          const sel = pendingSelection.includes(opt.id);
          return (
            <div
              key={opt.id}
              className={`option${sel ? ' selected' : ''}${isConfirmed ? ' answered' : ''}`}
              onClick={() => !isConfirmed && onSelect(opt.id)}
            >
              <div className="option-letter">{LETTERS[i] ?? opt.id.toUpperCase()}</div>
              <div className="option-text">{opt.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/[locale]/exam/[id]/ExamClient.tsx`**

```typescript
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QManifest from '@/components/exam/QManifest';
import Timer from '@/components/exam/Timer';
import QuestionCard from '@/components/exam/QuestionCard';
import type { PublicQuestion } from '@/lib/exam/serialize';
import { EXAM_SPECS } from '@/lib/exam/config';
import type { ExamCertLevel } from '@/lib/content/types';

interface Props {
  sessionId: string;
  locale: string;
  expiresAt: number;
  certLevel: ExamCertLevel;
}

export default function ExamClient({ sessionId, locale, expiresAt, certLevel }: Props) {
  const t = useTranslations('exam');
  const router = useRouter();

  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, string[]>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const totalMs = EXAM_SPECS[certLevel].timeLimitMinutes * 60_000;

  // Fetch questions on mount
  useEffect(() => {
    fetch(`/api/exam/${sessionId}/questions`)
      .then((r) => r.json())
      .then((qs: PublicQuestion[]) => {
        setQuestions(qs);
        setLoading(false);
      });
  }, [sessionId]);

  // Restore pending selection when question changes
  useEffect(() => {
    if (questions.length === 0) return;
    const q = questions[currentIdx];
    setPendingSelection(confirmed[q.id] ?? []);
  }, [currentIdx, questions]); // intentionally NOT depending on confirmed to avoid loop

  const submitExam = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    await fetch(`/api/exam/${sessionId}/submit`, { method: 'POST' });
    router.push(`/${locale}/exam/${sessionId}/results`);
  }, [sessionId, locale, router]);

  const confirmAnswer = useCallback(async () => {
    const q = questions[currentIdx];
    if (!q || pendingSelection.length === 0) return;

    await fetch(`/api/exam/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, selectedOptionIds: pendingSelection }),
    });

    const newConfirmed = { ...confirmed, [q.id]: pendingSelection };
    setConfirmed(newConfirmed);

    // Advance to first unanswered question after current, or next index
    const nextUnanswered = questions.findIndex((qn, i) => i > currentIdx && !newConfirmed[qn.id]);
    if (nextUnanswered !== -1) setCurrentIdx(nextUnanswered);
    else if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
  }, [questions, currentIdx, pendingSelection, confirmed, sessionId]);

  const selectOption = useCallback((optionId: string) => {
    const q = questions[currentIdx];
    if (!q) return;
    if (q.type === 'SINGLE') {
      setPendingSelection([optionId]);
    } else {
      setPendingSelection((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    }
  }, [questions, currentIdx]);

  const toggleFlag = useCallback(() => {
    const q = questions[currentIdx];
    if (!q) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }, [questions, currentIdx]);

  if (loading) {
    return <div className="exam-loading">{t('loading')}</div>;
  }

  const q = questions[currentIdx];
  if (!q) return null;

  const isConfirmed = Boolean(confirmed[q.id]);
  const isFlagged = flagged.has(q.id);
  const answeredCount = Object.keys(confirmed).length;

  return (
    <div className="exam-view">
      <QManifest
        questions={questions}
        currentIdx={currentIdx}
        confirmed={confirmed}
        flagged={flagged}
        onSelect={setCurrentIdx}
      />

      <div className="exam-main">
        {/* Top bar */}
        <div className="exam-topbar">
          <div className="q-counter">
            {t('question')} <span>{currentIdx + 1}</span> {t('of')} {questions.length}
          </div>
          <div className="subject-tag">{q.moduleId.replace(/-/g, ' ').toUpperCase()}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {answeredCount}/{questions.length} {t('answered')}
          </div>
        </div>

        {/* Timer */}
        <Timer expiresAt={expiresAt} totalMs={totalMs} onExpire={submitExam} />

        {/* Question */}
        <QuestionCard
          question={q}
          pendingSelection={pendingSelection}
          isConfirmed={isConfirmed}
          onSelect={selectOption}
        />

        {/* Actions */}
        <div className="action-bar">
          <button
            className="btn-confirm"
            onClick={confirmAnswer}
            disabled={pendingSelection.length === 0 || isConfirmed}
          >
            {t('confirmSelection')}
          </button>

          <button
            className="btn-skip"
            onClick={() => {
              if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
            }}
          >
            {t('skip')} ▶
          </button>

          <button
            className={`btn-flag${isFlagged ? ' flagged' : ''}`}
            onClick={toggleFlag}
          >
            ⚑ {t('flagForReview')}
          </button>

          <button
            className="btn-submit"
            onClick={submitExam}
            disabled={submitting}
          >
            {submitting ? t('submitting') : t('submitExam')}
          </button>
        </div>

        {/* Locale indicator */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 'auto' }}>
          Lang: <span style={{ color: 'var(--cyan)' }}>{locale.toUpperCase()}</span>
          {q.moduleId && (
            <> · ref: <span style={{ color: 'var(--cyan)' }}>TP-15263 § {q.moduleId}</span></>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/[locale]/exam/[id]/page.tsx`** — server wrapper

```typescript
import { notFound } from 'next/navigation';
import { examService } from '@/lib/exam/instance';
import ExamClient from './ExamClient';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ExamPage({ params }: Props) {
  const { locale, id } = await params;

  // Verify session exists and get expiresAt for the client timer
  const expiresAt = await examService.getExpiresAt(id);
  if (expiresAt === null) notFound();

  // Get certLevel from session to pass correct time limit to Timer
  const session = await (examService as any).store?.get?.(id);
  // Fallback: derive from questions count is unreliable; use ADVANCED as safe default
  // The cert level is used only for the timer progress bar denominator
  // If store access is not available, default to ADVANCED (60 min) as the shorter limit
  const certLevel = (session?.certLevel ?? 'ADVANCED') as 'BASIC' | 'ADVANCED';

  return (
    <ExamClient
      sessionId={id}
      locale={locale}
      expiresAt={expiresAt}
      certLevel={certLevel}
    />
  );
}
```

**Note on certLevel access:** The ExamService doesn't currently expose `certLevel`. The `(examService as any).store?.get?.(id)` is a dev-only workaround. For Plan 3, add `getCertLevel(sessionId)` to ExamService. If the cast feels wrong, simply hardcode `certLevel="ADVANCED"` for now — it only affects the timer bar visual, not correctness.

A cleaner alternative: add a minimal `getSessionMeta(sessionId)` method to ExamService in a follow-up commit:

```typescript
// Add to service.ts
async getSessionMeta(sessionId: string): Promise<{ certLevel: ExamCertLevel; expiresAt: number } | null> {
  const session = await this.store.get(sessionId);
  if (!session) return null;
  return { certLevel: session.certLevel, expiresAt: session.expiresAt };
}
```

Then `page.tsx` becomes:

```typescript
import { notFound } from 'next/navigation';
import { examService } from '@/lib/exam/instance';
import ExamClient from './ExamClient';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ExamPage({ params }: Props) {
  const { locale, id } = await params;
  const meta = await examService.getSessionMeta(id);
  if (!meta) notFound();
  return (
    <ExamClient
      sessionId={id}
      locale={locale}
      expiresAt={meta.expiresAt}
      certLevel={meta.certLevel}
    />
  );
}
```

Implement this cleaner version: add `getSessionMeta()` to `src/lib/exam/service.ts` and use it in the page. Do NOT write a Vitest test for `getSessionMeta()` — it's trivially covered by the existing store tests.

- [ ] **Step 6: Verify full exam flow**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

1. Go to `http://localhost:3000/en/exam`
2. Select ADVANCED, click Launch Exam → redirected to `/en/exam/[sessionId]`
3. Verify: Q-manifest dots appear (50 dots for ADVANCED), timer counting down, first question rendered with options
4. Click an option → it highlights (selected state)
5. Click CONFIRM SELECTION → dot turns answered (cyan), advances to Q2
6. Click a Q-manifest dot → jumps to that question
7. Click ⚑ FLAG FOR REVIEW → dot turns amber
8. Click SUBMIT EXAM → redirected to `/en/exam/[sessionId]/results` (404 until Task 9)

Stop server.

- [ ] **Step 7: Run tests and typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: 48 tests pass, typecheck clean. If `getSessionMeta` was added, no test needed — but ensure its signature in service.ts is correct.

- [ ] **Step 8: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/components/exam "app/[locale]/exam/[id]" src/lib/exam/service.ts
git -C /Users/quzhenrong/rpas-lms commit -m "feat: exam question interface with timer, Q-manifest, answer/submit flow"
```

---

## Task 9 — Results / Debrief page

**Files:**
- Create: `src/components/results/SubjectBreakdown.tsx`
- Create: `app/[locale]/exam/[id]/results/page.tsx`

- [ ] **Step 1: Create `src/components/results/SubjectBreakdown.tsx`**

```typescript
import { getTranslations } from 'next-intl/server';
import type { SubjectScore } from '@/lib/exam/score';

const MODULE_NAMES: Record<string, string> = {
  'air-law': 'Air Law',
  'flight-operations': 'Flight Ops',
  'human-factors': 'Human Factors',
  'meteorology': 'Meteorology',
  'navigation': 'Navigation',
  'airframes-systems': 'Airframes',
  'radiotelephony': 'Radiotelephony',
  'theory-of-flight': 'Theory of Flight',
};

function quality(correct: number, total: number): 'good' | 'warn' | 'poor' {
  const pct = total === 0 ? 1 : correct / total;
  if (pct >= 0.8) return 'good';
  if (pct >= 0.6) return 'warn';
  return 'poor';
}

interface Props {
  bySubject: SubjectScore[];
  locale: string;
}

export default async function SubjectBreakdown({ bySubject, locale }: Props) {
  const t = await getTranslations({ locale });
  const weakModules = bySubject
    .filter((s) => quality(s.correct, s.total) !== 'good')
    .map((s) => MODULE_NAMES[s.moduleId] ?? s.moduleId);

  return (
    <div className="hud-panel breakdown-card">
      <div className="breakdown-title">// {t('results.perSubject')}</div>
      {bySubject.map((s) => {
        const pct = s.total === 0 ? 0 : Math.round((s.correct / s.total) * 100);
        const q = quality(s.correct, s.total);
        return (
          <div key={s.moduleId} className="subject-row">
            <div className="subj-name">{MODULE_NAMES[s.moduleId] ?? s.moduleId}</div>
            <div className="subj-bar">
              <div className={`subj-fill ${q}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="subj-score">{s.correct} / {s.total}</div>
          </div>
        );
      })}
      {weakModules.length > 0 && (
        <div className="weak-areas">
          {t('results.weakAreas')}: <span>{weakModules.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/[locale]/exam/[id]/results/page.tsx`**

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { examService } from '@/lib/exam/instance';
import ProgressRing from '@/components/dashboard/ProgressRing';
import SubjectBreakdown from '@/components/results/SubjectBreakdown';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ResultsPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale });

  const result = await examService.getResult(id);
  if (!result) {
    return (
      <div className="results-view" style={{ justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontSize: 13 }}>
          {t('results.notFound')}
        </div>
        <Link href={`/${locale}/exam`} className="btn-launch">
          ▶ {t('examLaunch.launch')}
        </Link>
      </div>
    );
  }

  const scorePct = Math.round(result.scorePct * 100);
  const passed = result.passed;
  const now = new Date().toISOString().split('T')[0];

  return (
    <div className="results-view">
      {/* Status header */}
      <div className="result-header">
        <div className={`result-status${passed ? ' pass' : ' fail'}`}>
          {passed ? t('results.missionComplete') : t('results.missionFailed')}
        </div>
        <div className="result-code">
          // {passed ? t('results.passStatus') : t('results.failStatus')} · {result.correct}/{result.total} · {now}
        </div>
      </div>

      {/* Score row */}
      <div className="result-score-row">
        {/* Score gauge */}
        <div className={`hud-panel score-gauge-card`}>
          <ProgressRing
            pct={scorePct}
            size={130}
            label={`${scorePct}%`}
            sublabel={t('results.score')}
          />
          <div className="score-detail">
            <strong className={passed ? '' : 'fail'}>{result.correct}</strong> / {result.total} {t('results.correct')}
            <br />
            <span style={{ color: passed ? 'var(--green)' : 'var(--red)', fontSize: 11 }}>
              {passed ? '↑' : '↓'} {t('results.passStatus')}
            </span>
          </div>
          <div className="overall-label">
            // RESULT: {passed ? t('results.passStatus') : t('results.failStatus')}
          </div>
        </div>

        {/* Per-subject breakdown */}
        <SubjectBreakdown bySubject={result.bySubject} locale={locale} />
      </div>

      {/* Action buttons */}
      <div className="result-actions">
        <Link href={`/${locale}/exam`} className="btn-retry">
          ▶ {t('results.newMission')}
        </Link>
        <Link href={`/${locale}`} className="btn-review">
          ↩ {t('results.reviewAnswers')}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify full end-to-end flow**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm dev
```

Full flow:
1. `http://localhost:3000/en` — dashboard, click START EXAM
2. `/en/exam` — select ADVANCED, click Launch Exam
3. `/en/exam/[sessionId]` — answer a few questions, click SUBMIT EXAM
4. `/en/exam/[sessionId]/results` — verify score ring shows correct percentage, per-subject bars rendered, PASS/FAIL status displayed with correct color
5. Click "▶ New Mission" — back to `/en/exam`
6. Navigate to `/fr` on any page — all text switches to French

Also verify: if you directly navigate to a results URL without submitting, you see the "Result not found" error state.

- [ ] **Step 4: Run tests and final typecheck**

```bash
cd /Users/quzhenrong/rpas-lms && pnpm test && pnpm typecheck
```

Expected: 48 tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/quzhenrong/rpas-lms add src/components/results "app/[locale]/exam/[id]/results"
git -C /Users/quzhenrong/rpas-lms commit -m "feat: results/debrief page with score ring, per-subject breakdown, weak-area highlight"
```

---

## Plan 2 — Definition of Done

- [ ] `pnpm test` — **48 tests passing** (44 original + 4 new from Task 6)
- [ ] `pnpm typecheck` — no errors
- [ ] `pnpm dev` — server starts, no console errors
- [ ] Full flow works: dashboard → exam launch → exam → submit → results
- [ ] `/en` and `/fr` both render with correct language
- [ ] EN/FR locale switcher in header changes language on the same page
- [ ] Timer counts down; auto-submits at 0
- [ ] Q-manifest dots reflect answered/flagged/current states
- [ ] Results page shows PASS/FAIL, score %, per-subject bars, weak-area callout
- [ ] Answers after expiry are rejected (verified by Task 6 tests)

## Gaps carried forward to Plan 3

- Progress tracking on module cards requires auth + Prisma (all show 0%)
- Post-exam "Review Answers" page (show correct answers with explanation) requires storing question state
- Exam session persistence across server restarts requires Prisma (InMemoryStore is process-local)
- EN/FR locale switcher on exam page should preserve session ID in URL (current implementation does)
