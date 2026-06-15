import Link from 'next/link';
import type { MarketingPageContent } from '@/lib/marketing/content';

export default function MarketingPage({ content, locale }: { content: MarketingPageContent; locale: string }) {
  const isChinese = locale === 'zh';

  return (
    <article className="legal-page marketing-page">
      <div className="legal-shell">
        <nav className="legal-breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${locale}`}>{isChinese ? '首页' : 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{content.eyebrow}</span>
        </nav>

        <header className="legal-header">
          <p>{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p>{content.summary}</p>
        </header>

        <div className="legal-sections">
          {content.sections.map((section) => (
            <section key={section.heading} id={section.id} className="legal-section">
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
