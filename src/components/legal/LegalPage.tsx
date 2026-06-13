import Link from 'next/link';
import type { LegalPageContent } from '@/lib/legal/content';

export default function LegalPage({ content, locale }: { content: LegalPageContent; locale: string }) {
  const isChinese = locale === 'zh';

  return (
    <article className="legal-page">
      <div className="legal-shell">
        <nav className="legal-breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${locale}`}>{isChinese ? '首页' : 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{content.title}</span>
        </nav>

        <header className="legal-header">
          <p>{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p>{content.summary}</p>
          <p>{isChinese ? '最后更新：' : 'Last updated: '}{content.lastUpdated}</p>
        </header>

        <div className="legal-notice">
          <p>
            {isChinese
              ? '这些页面用于提高透明度和运营清晰度，不构成法律意见。Pacific Drone 应请不列颠哥伦比亚省律师审核最终文字。'
              : 'These pages are provided for transparency and operational clarity, not legal advice. Pacific Drone should have final wording reviewed by a BC lawyer.'}
          </p>
        </div>

        <div className="legal-sections">
          {content.sections.map((section) => (
            <section key={section.heading} className="legal-section">
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
