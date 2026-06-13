# Legal Foundation Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four public legal foundation pages for Pacific Drone and wire footer links to real routes.

**Architecture:** Keep legal content in one typed data file and render it through one reusable legal page component. Each App Router page is a thin route entry that selects content by slug and locale.

**Tech Stack:** Next.js 15 App Router, React Server Components, TypeScript, next-intl route locale, existing global CSS design tokens.

---

## File Structure

- Create `src/lib/legal/content.ts`: typed legal page content, page list, and lookup helper.
- Create `src/components/legal/LegalPage.tsx`: reusable renderer for legal pages.
- Create `app/[locale]/terms/page.tsx`: Terms route.
- Create `app/[locale]/privacy/page.tsx`: Privacy route.
- Create `app/[locale]/refund-policy/page.tsx`: Refund Policy route.
- Create `app/[locale]/contact/page.tsx`: Contact / Legal Notice route.
- Modify `src/components/home/SiteFooter.tsx`: replace placeholder resource/contact links with real routes and add legal links.
- Modify `app/globals.css`: add legal page layout classes.

## Task 1: Add Typed Legal Content

**Files:**
- Create: `src/lib/legal/content.ts`

- [ ] **Step 1: Create legal content module**

Create `src/lib/legal/content.ts` with:

```ts
export type LegalPageSlug = 'terms' | 'privacy' | 'refund-policy' | 'contact';

export type LegalSection = {
  heading: string;
  body: string[];
  bullets?: string[];
};

export type LegalPageContent = {
  slug: LegalPageSlug;
  title: string;
  eyebrow: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export const legalPages: LegalPageContent[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    eyebrow: 'Legal terms',
    summary: 'Rules for using Pacific Drone courses, accounts, training materials, and related services.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'These Terms are a business draft for Pacific Drone and are not legal advice. Pacific Drone should have these Terms reviewed by a lawyer licensed in British Columbia before relying on them.'
        ]
      },
      {
        heading: 'Company and contact',
        body: [
          'These Terms apply to websites, courses, flight review booking services, communications, and related services operated by Pacific Drone. You can contact us at info@pacificdrone.ca.'
        ]
      },
      {
        heading: 'Eligibility and accounts',
        body: [
          'You must provide accurate account and purchase information. You are responsible for keeping your login credentials secure and for activity that occurs under your account.',
          'Accounts are for individual use unless Pacific Drone expressly agrees otherwise in writing. You may not share, sell, transfer, sublicense, or pool access with another person or organization.'
        ]
      },
      {
        heading: 'Course access and license',
        body: [
          'When you purchase a course, you receive a personal, limited, non-transferable license to access the course materials. You do not purchase ownership of the course content, videos, question banks, explanations, diagrams, downloadable materials, or platform code.',
          'Course access is ongoing while the course remains commercially available and your account remains in good standing. Pacific Drone may update, replace, reorganize, or remove outdated content as regulations, training needs, or platform requirements change.'
        ]
      },
      {
        heading: 'Payments, taxes, pricing, and promotions',
        body: [
          'Prices, taxes, and mandatory fees should be shown before checkout confirmation. Unless stated otherwise, prices are listed in Canadian dollars.',
          'Payments may be processed by third-party payment providers such as Stripe. Pacific Drone does not store full payment card numbers.',
          'Pacific Drone may change prices, run promotions, issue coupon codes, or discontinue offers. Promotions apply only according to the rules shown with the offer and are not retroactive unless Pacific Drone states otherwise.'
        ]
      },
      {
        heading: 'Training results and regulatory disclaimer',
        body: [
          'Pacific Drone provides training and study tools. We do not guarantee that you will pass an exam, receive a certificate, obtain work, earn income, qualify for insurance, receive authorization from any regulator, or comply with every legal requirement for a specific operation.',
          'You are responsible for checking current laws, Transport Canada requirements, airspace restrictions, site conditions, aircraft documentation, insurance requirements, and operational safety before flying.'
        ]
      },
      {
        heading: 'User conduct',
        body: [
          'You may not misuse the site, interfere with the platform, attempt unauthorized access, scrape protected content, upload harmful code, harass others, submit false information, or use the services for unlawful activities.'
        ]
      },
      {
        heading: 'Intellectual property restrictions',
        body: [
          'Pacific Drone and its licensors own the course materials and platform content. Except where the site expressly allows personal learning use, you may not copy, record, download, redistribute, resell, publish, upload to file-sharing services, train competing course materials from, or otherwise exploit the content.'
        ]
      },
      {
        heading: 'Third-party services',
        body: [
          'The site may rely on third-party services such as payment processors, hosting providers, learning management tools, email providers, analytics services, and advertising pixels. Those services may have their own terms and privacy practices.'
        ]
      },
      {
        heading: 'Suspension and termination',
        body: [
          'Pacific Drone may suspend or terminate access if we reasonably believe you violated these Terms, created risk for the platform or other users, infringed intellectual property rights, attempted payment fraud, or misused course materials.'
        ]
      },
      {
        heading: 'No warranty and limitation of liability',
        body: [
          'The services are provided on an as-is and as-available basis. To the maximum extent permitted by law, Pacific Drone disclaims warranties that the services will be uninterrupted, error-free, or fit for every particular purpose.',
          'To the maximum extent permitted by law, Pacific Drone will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages arising from your use of the services.'
        ]
      },
      {
        heading: 'Indemnity, force majeure, and disputes',
        body: [
          'You agree to indemnify Pacific Drone from claims arising from your misuse of the services, breach of these Terms, infringement of third-party rights, or unlawful operations.',
          'Pacific Drone is not responsible for delays or failures caused by events outside reasonable control, including outages, payment processor interruptions, labour disruptions, severe weather, regulatory changes, emergencies, or force majeure events.',
          'These Terms are governed by the laws of British Columbia and applicable Canadian federal laws. Disputes should be handled in the courts or applicable dispute forum in British Columbia unless consumer protection law requires otherwise.'
        ]
      },
      {
        heading: 'Course and product terms',
        body: [
          'Digital course access is personal and non-transferable. Live coaching, consultation, and flight review services may require scheduling, eligibility checks, weather suitability, documentation, and operational safety decisions.',
          'Pacific Drone may decline, reschedule, or stop a flight review or live service if safety, weather, documentation, site conditions, legal requirements, or instructor availability make the service unsuitable.'
        ]
      },
      {
        heading: 'Changes to these Terms',
        body: [
          'Pacific Drone may update these Terms from time to time. Updated Terms will be posted on this page with a new effective date. Material changes may also be communicated through the site or by email where appropriate.'
        ]
      }
    ]
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    eyebrow: 'Privacy',
    summary: 'How Pacific Drone collects, uses, stores, and shares information for course access and site operations.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'This Privacy Policy is a business draft and is not legal advice. Pacific Drone should have it reviewed for British Columbia and Canadian privacy compliance before relying on it.'
        ]
      },
      {
        heading: 'Who is responsible',
        body: [
          'Pacific Drone is responsible for personal information collected through its website, courses, checkout flows, support channels, and related services. Privacy questions can be sent to info@pacificdrone.ca.'
        ]
      },
      {
        heading: 'Information we collect',
        body: [
          'We may collect account details, contact information, order records, payment metadata, course progress, exam or practice activity, support messages, device information, IP address, browser information, cookies, and marketing interaction data.'
        ]
      },
      {
        heading: 'How we use information',
        body: [
          'We use information to create and secure accounts, provide course access, process orders, support students, maintain records, prevent fraud, improve the site, analyze performance, send service messages, send marketing where permitted, and comply with legal obligations.'
        ]
      },
      {
        heading: 'Third-party service providers',
        body: [
          'We may use third-party providers for payments, hosting, learning management, email delivery, analytics, advertising measurement, customer support, and security. These providers may process information for us or under their own terms depending on the service.',
          'Payment card processing may be handled by providers such as Stripe. Pacific Drone does not store full payment card numbers.'
        ]
      },
      {
        heading: 'Cookies and similar technologies',
        body: [
          'We may use necessary cookies to operate login, checkout, security, and language preferences. If enabled, we may also use analytics cookies to understand site performance and advertising cookies or pixels to measure campaigns.',
          'You can control cookies through your browser settings. Where consent tools are available, you may accept, reject, or withdraw consent for non-essential cookies. You may also use industry opt-out tools or platform settings for targeted advertising.'
        ]
      },
      {
        heading: 'Cross-border processing and retention',
        body: [
          'Some service providers may process or store information outside British Columbia or Canada. Information processed in another jurisdiction may be subject to the laws of that jurisdiction.',
          'We keep personal information only as long as reasonably needed for the purposes described in this Policy, including account access, course records, legal compliance, dispute handling, tax records, and security.'
        ]
      },
      {
        heading: 'Your privacy choices and rights',
        body: [
          'Depending on applicable law, you may request access to your personal information, correction of inaccurate information, deletion where legally available, withdrawal of consent, or information about how your data is used.',
          'You can unsubscribe from marketing emails using the link in the email or by contacting info@pacificdrone.ca. Service messages related to your account or purchase may still be sent.'
        ]
      },
      {
        heading: 'Security, breaches, and minors',
        body: [
          'We use reasonable administrative, technical, and organizational safeguards designed to protect personal information. No online system can be guaranteed completely secure.',
          'If a privacy incident requires notice under applicable law, we will take steps to investigate, contain, document, and notify affected parties or regulators as required.',
          'The services are intended for users who can lawfully purchase or use online training services. Minors should use the services only with appropriate parent or guardian involvement.'
        ]
      }
    ]
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    eyebrow: 'Purchases',
    summary: 'Refund and cancellation rules for Pacific Drone courses, digital products, and flight review bookings.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Important note',
        body: [
          'This Refund Policy is a business draft and is not legal advice. Pacific Drone should have it reviewed for British Columbia distance-sales and consumer protection requirements before relying on it.'
        ]
      },
      {
        heading: 'How to request a refund',
        body: [
          'To request a refund, email info@pacificdrone.ca with your name, account email, order number if available, purchase date, product or service purchased, and the reason for the request.'
        ]
      },
      {
        heading: 'Digital course refunds',
        body: [
          'Digital course purchases are eligible for refund within 14 days from the purchase date unless the student has accessed or viewed more than 20% of the course content.',
          'Once more than 20% of the course content has been accessed or viewed, the course purchase is non-refundable, even if the request is made within 14 days.'
        ]
      },
      {
        heading: 'Flight review refunds and cancellations',
        body: [
          'A booked flight review is non-refundable within 48 hours of the scheduled review time.',
          'If you cancel more than 48 hours before the scheduled review time, Pacific Drone may refund the booking minus 50% of the flight review fee.',
          'Pacific Drone may reschedule a flight review when weather, safety, documentation, site conditions, instructor availability, or legal requirements make the review unsuitable.'
        ]
      },
      {
        heading: 'Non-refundable cases',
        body: [
          'Refunds may be denied for accounts that have exceeded the course progress limit, misused access, shared accounts, copied or redistributed materials, violated the Terms, completed a live consultation or coaching session, received a certificate or completion record where applicable, purchased a custom or enterprise service, or purchased under a final-sale promotion clearly identified at checkout.'
        ]
      },
      {
        heading: 'Processing and payment method',
        body: [
          'Approved refunds are generally returned to the original payment method where technically available. Processing times may depend on the payment processor, card issuer, bank, or platform.',
          'If the original payment method cannot receive a refund, Pacific Drone may offer an alternative method or account credit where lawful and appropriate.'
        ]
      },
      {
        heading: 'Chargebacks and special circumstances',
        body: [
          'If you have a billing concern, contact Pacific Drone first so we can review the issue. If a chargeback is filed, we may provide order records, account access records, course progress, booking records, and policy terms to the payment processor.',
          'Pacific Drone may consider documented hardship, duplicate payment, technical access failure, or other exceptional circumstances case by case, without waiving the general policy.'
        ]
      }
    ]
  },
  {
    slug: 'contact',
    title: 'Contact / Legal Notice',
    eyebrow: 'Contact',
    summary: 'How to reach Pacific Drone for support, legal notices, privacy questions, and policy requests.',
    lastUpdated: 'June 13, 2026',
    sections: [
      {
        heading: 'Contact Pacific Drone',
        body: [
          'For course support, billing questions, refund requests, privacy questions, or legal notices, contact Pacific Drone at info@pacificdrone.ca.'
        ]
      },
      {
        heading: 'Legal notices',
        body: [
          'Legal notices should include your full name, contact information, the account or order involved if applicable, a clear description of the request, and any supporting documentation. Email delivery does not guarantee that a notice is legally sufficient in every situation.'
        ]
      },
      {
        heading: 'Support scope',
        body: [
          'Pacific Drone can help with account access, course access, billing issues, refund requests, scheduling questions, and platform support. Pacific Drone does not provide legal advice, emergency aviation support, or final operational authorization for a specific flight.'
        ]
      },
      {
        heading: 'Operational and regulatory disclaimer',
        body: [
          'Training materials and support communications are for education. Pilots and organizations remain responsible for checking current rules, aircraft requirements, airspace restrictions, site conditions, insurance requirements, and operational safety before flying.'
        ]
      },
      {
        heading: 'Related policies',
        body: [
          'Before purchasing or using Pacific Drone services, review the Terms of Service, Privacy Policy, and Refund Policy.'
        ],
        bullets: [
          'Terms of Service: /terms',
          'Privacy Policy: /privacy',
          'Refund Policy: /refund-policy'
        ]
      }
    ]
  }
];

export function getLegalPage(slug: LegalPageSlug) {
  return legalPages.find((page) => page.slug === slug);
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or unrelated existing errors. There should be no TypeScript errors in `src/lib/legal/content.ts`.

## Task 2: Add Reusable Legal Renderer

**Files:**
- Create: `src/components/legal/LegalPage.tsx`

- [ ] **Step 1: Create renderer**

Create `src/components/legal/LegalPage.tsx` with:

```tsx
import Link from 'next/link';
import type { LegalPageContent } from '@/lib/legal/content';

export default function LegalPage({
  content,
  locale,
}: {
  content: LegalPageContent;
  locale: string;
}) {
  return (
    <article className="legal-page">
      <div className="legal-shell">
        <nav className="legal-breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${locale}`}>Home</Link>
          <span>/</span>
          <span>{content.title}</span>
        </nav>

        <header className="legal-header">
          <p className="legal-eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="legal-summary">{content.summary}</p>
          <p className="legal-updated">Last updated: {content.lastUpdated}</p>
        </header>

        <div className="legal-notice">
          These pages are provided for transparency and operational clarity. They are not legal advice.
          Pacific Drone should have final wording reviewed by a British Columbia lawyer.
        </div>

        <div className="legal-sections">
          {content.sections.map((section) => (
            <section className="legal-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or unrelated existing errors. There should be no TypeScript errors in `LegalPage.tsx`.

## Task 3: Add Four App Router Pages

**Files:**
- Create: `app/[locale]/terms/page.tsx`
- Create: `app/[locale]/privacy/page.tsx`
- Create: `app/[locale]/refund-policy/page.tsx`
- Create: `app/[locale]/contact/page.tsx`

- [ ] **Step 1: Create Terms route**

Create `app/[locale]/terms/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import LegalPage from '@/components/legal/LegalPage';
import { getLegalPage } from '@/lib/legal/content';

type Props = { params: Promise<{ locale: string }> };

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  const content = getLegalPage('terms');
  if (!content) notFound();
  return <LegalPage content={content} locale={locale} />;
}
```

- [ ] **Step 2: Create Privacy route**

Create `app/[locale]/privacy/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import LegalPage from '@/components/legal/LegalPage';
import { getLegalPage } from '@/lib/legal/content';

type Props = { params: Promise<{ locale: string }> };

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  const content = getLegalPage('privacy');
  if (!content) notFound();
  return <LegalPage content={content} locale={locale} />;
}
```

- [ ] **Step 3: Create Refund Policy route**

Create `app/[locale]/refund-policy/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import LegalPage from '@/components/legal/LegalPage';
import { getLegalPage } from '@/lib/legal/content';

type Props = { params: Promise<{ locale: string }> };

export default async function RefundPolicyPage({ params }: Props) {
  const { locale } = await params;
  const content = getLegalPage('refund-policy');
  if (!content) notFound();
  return <LegalPage content={content} locale={locale} />;
}
```

- [ ] **Step 4: Create Contact route**

Create `app/[locale]/contact/page.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import LegalPage from '@/components/legal/LegalPage';
import { getLegalPage } from '@/lib/legal/content';

type Props = { params: Promise<{ locale: string }> };

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const content = getLegalPage('contact');
  if (!content) notFound();
  return <LegalPage content={content} locale={locale} />;
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or unrelated existing errors. There should be no route typing errors.

## Task 4: Add Legal Page Styles

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add legal CSS near other page-level sections**

Append this block to `app/globals.css`:

```css
/* ═══════════════════════════════
   LEGAL PAGES
═══════════════════════════════ */
.legal-page {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-base);
}

.legal-shell {
  width: min(920px, calc(100% - 32px));
  margin: 0 auto;
  padding: 42px 0 64px;
}

.legal-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.legal-breadcrumb a {
  color: var(--accent-text);
  text-decoration: none;
}

.legal-breadcrumb a:hover {
  text-decoration: underline;
}

.legal-header {
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}

.legal-eyebrow {
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.legal-header h1 {
  font-family: var(--font-display);
  font-size: clamp(36px, 6vw, 64px);
  line-height: 0.95;
  letter-spacing: 0;
  color: var(--text-1);
}

.legal-summary {
  max-width: 680px;
  margin-top: 18px;
  font-size: 18px;
  line-height: 1.55;
  color: var(--text-2);
}

.legal-updated {
  margin-top: 18px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.legal-notice {
  margin: 24px 0;
  padding: 14px 16px;
  border: 1px solid var(--accent-line);
  border-radius: var(--r-ctl);
  background: var(--accent-soft);
  color: var(--text-2);
}

.legal-sections {
  display: grid;
  gap: 22px;
}

.legal-section {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.legal-section h2 {
  margin-bottom: 12px;
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.15;
  color: var(--text-1);
}

.legal-section p {
  margin-top: 10px;
  color: var(--text-2);
  line-height: 1.65;
}

.legal-section ul {
  margin: 12px 0 0 20px;
  color: var(--text-2);
}

.legal-section li {
  margin-top: 6px;
  line-height: 1.55;
}

@media (max-width: 760px) {
  .legal-shell {
    width: min(100% - 24px, 920px);
    padding: 28px 0 48px;
  }

  .legal-header h1 {
    font-size: 38px;
  }

  .legal-summary {
    font-size: 16px;
  }

  .legal-section {
    padding: 18px;
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or unrelated existing errors.

## Task 5: Wire Footer Links

**Files:**
- Modify: `src/components/home/SiteFooter.tsx`

- [ ] **Step 1: Replace resource/contact placeholder links**

Update the footer resource section to use real links:

```tsx
<div>
  <div className="footer-col-title">{t('resourcesTitle')}</div>
  <div className="footer-links">
    <Link href={`/${locale}/terms`} className="footer-link">Terms of Service</Link>
    <Link href={`/${locale}/privacy`} className="footer-link">Privacy Policy</Link>
    <Link href={`/${locale}/refund-policy`} className="footer-link">Refund Policy</Link>
    <Link href={`/${locale}/contact`} className="footer-link">Contact / Legal Notice</Link>
  </div>
</div>
```

- [ ] **Step 2: Remove sample contact tags**

Update the contact block to remove `sample` labels and use the confirmed email:

```tsx
<div className="footer-contact">
  <span>info@pacificdrone.ca</span>
  <span>British Columbia, Canada</span>
</div>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or unrelated existing errors. There should be no JSX or import errors in `SiteFooter.tsx`.

## Task 6: Build Verification

**Files:**
- Verify: whole project

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `pnpm build`

Expected: PASS. Build output should include the four new localized routes.

- [ ] **Step 3: If build fails on unrelated pre-existing issue**

Record the exact failing command and first relevant error. Do not hide build failures.

## Task 7: Final Commit

**Files:**
- Add all files changed by Tasks 1-6.

- [ ] **Step 1: Inspect diff**

Run: `git diff -- src/lib/legal/content.ts src/components/legal/LegalPage.tsx app/[locale]/terms/page.tsx app/[locale]/privacy/page.tsx app/[locale]/refund-policy/page.tsx app/[locale]/contact/page.tsx src/components/home/SiteFooter.tsx app/globals.css`

Expected: diff only includes legal content, legal renderer, legal routes, footer links, and legal styles.

- [ ] **Step 2: Commit implementation**

Run:

```bash
git add src/lib/legal/content.ts src/components/legal/LegalPage.tsx app/[locale]/terms/page.tsx app/[locale]/privacy/page.tsx app/[locale]/refund-policy/page.tsx app/[locale]/contact/page.tsx src/components/home/SiteFooter.tsx app/globals.css
git commit -m "feat: add legal foundation pages"
```

Expected: commit succeeds and unrelated `.claude/settings.json` remains uncommitted.
