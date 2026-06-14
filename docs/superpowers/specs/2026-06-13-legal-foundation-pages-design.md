# Legal Foundation Pages Design

## Goal

Add a first set of legal and commercial foundation pages for the Pacific Drone training site so footer links, checkout references, and future sitemap entries can point to real pages. The content should be professional, clear, and suitable for a British Columbia online course/training business, while remaining a business draft that Pacific Drone should have reviewed by a BC lawyer before relying on it.

## Scope

Create four public localized routes:

- `/{locale}/terms`
- `/{locale}/privacy`
- `/{locale}/refund-policy`
- `/{locale}/contact`

Cookie terms and course/product terms will be included as sections inside the Terms and Privacy pages for this first version. They can be split into separate pages later without changing the overall content model.

## Business Defaults

- Company name: Pacific Drone
- Contact email: `info@pacificdrone.ca`
- Governing law: British Columbia, Canada
- Course access: ongoing access while the course remains commercially available and the account remains in good standing
- Standard course refund: eligible within 14 days from purchase date, unless the student has accessed or viewed more than 20% of the course content
- Flight review refund: non-refundable within 48 hours of the scheduled review; more than 48 hours before the scheduled review, refundable minus 50% of the flight review fee
- Payments: handled by third-party payment processors such as Stripe; Pacific Drone does not store full payment card numbers
- Results disclaimer: no guarantee of exam success, certification, employment, income, insurance approval, or regulatory compliance

## Page Content

### Terms

The Terms page will cover company identity, eligibility, account registration, account security, no account sharing, course access as a license rather than ownership, ongoing access limitations, payments, taxes, price changes, promotions, course updates, content removal, exam/certification disclaimers, user conduct, intellectual property restrictions, third-party services, suspension/termination, no warranty, limitation of liability, indemnification, force majeure, terms changes, governing law, and a lawyer-review note.

It will also include the first-version Course/Product Terms section, covering digital course access, live/flight review scheduling rules, non-transferability, and training outcome limits.

### Privacy

The Privacy page will identify Pacific Drone as the business responsible for the site and explain collected data categories: account information, order and payment metadata, course progress, support messages, device/IP/browser/Cookie data, and marketing interactions.

It will explain use purposes: account access, order fulfilment, course delivery, support, fraud prevention, analytics, marketing, legal compliance, and service improvement. It will mention third-party processors such as payment providers, LMS/hosting providers, analytics tools, advertising pixels, and email providers when enabled. It will cover cross-border processing, retention, user rights, consent withdrawal, marketing unsubscribe, security safeguards, breach response, minors, and the privacy contact.

It will also include the first-version Cookie Policy section, covering necessary cookies, analytics cookies, advertising cookies, third-party pixels, retention, consent, withdrawal, and opt-out options.

### Refund Policy

The Refund Policy page will state the 14-day purchase-date window, the 20% course-progress cutoff, how to request a refund by email, required request information, processing time, refund destination, admin fee handling if applicable later, flight review cancellation/refund rules, non-refundable cases, chargeback handling, and discretionary hardship exceptions.

The content must not use vague fee language unless a quantified fee is specified. Since the current confirmed flight review rule uses a 50% deduction, that will be explicit.

### Contact / Legal Notice

The Contact page will provide general contact and legal notice details: company name, contact email, response expectations, legal notice delivery, support scope, regulatory disclaimer, emergency/non-operational-advice disclaimer, and links back to Terms, Privacy, and Refund Policy.

## Implementation Shape

Use one reusable legal page component and one centralized content source. Each route will be a small page entry that selects the relevant content. Styling should reuse the existing institutional light design: constrained reading width, clear section hierarchy, readable paragraphs, simple notice blocks, and no marketing hero.

Footer links will be updated so legal and contact links point to real routes instead of `#`.

## Verification

Run:

- `pnpm typecheck`
- `pnpm build`

Manual route checks:

- `/en/terms`
- `/en/privacy`
- `/en/refund-policy`
- `/en/contact`
- equivalent `/zh/...` routes can initially render English legal draft content if Chinese legal copy is not yet approved

## Risks And Review Notes

These pages are business/legal drafts, not legal advice. Pacific Drone should ask a BC lawyer to review the final wording, especially refund limits, flight review cancellation terms, liability limits, privacy disclosures, distance-sales requirements, and checkout consent language.

The checkout page should later show the course access rule, refund summary, total price/taxes, and Terms/Privacy/Refund links before purchase confirmation.
