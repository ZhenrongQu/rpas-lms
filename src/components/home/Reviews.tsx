import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';

type ProofItem = { label: string; title: string; body: string };
type QuoteItem = { name: string; role: string; quote: string };

export default async function Reviews({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.reviews' });
  const proofItems = t.raw('proofItems') as ProofItem[];
  const quotes = t.raw('quotes') as QuoteItem[];

  return (
    <section className="home-section" id="reviews">
      <div className="home-inner">
        <Reveal>
          <span className="home-kicker">{t('kicker')}</span>
          <h2 className="home-h2">{t('title')}</h2>
        </Reveal>

        <div className="proof-grid">
          {proofItems.map((item, i) => (
            <Reveal key={item.label} as="article" className="proof-card" delay={i * 0.07}>
              <span className="proof-label">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </div>

        <div className="pilot-voices">
          <Reveal>
            <h3 className="pilot-voices-title">{t('quotesTitle')}</h3>
          </Reveal>

          <div className="quotes-grid">
            {quotes.map((quote, i) => (
              <Reveal key={`${quote.name}-${i}`} as="figure" className="pilot-quote-card" delay={i * 0.07}>
                <blockquote className="pilot-quote">“{quote.quote}”</blockquote>
                <figcaption className="pilot-who">
                  <span className="pilot-name">{quote.name}</span>
                  <span className="pilot-role">{quote.role}</span>
                </figcaption>
              </Reveal>
            ))}
          </div>

          <p className="reviews-disclaimer">{t('disclaimer')}</p>
        </div>
      </div>
    </section>
  );
}
