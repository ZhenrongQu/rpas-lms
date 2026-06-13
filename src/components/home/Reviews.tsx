import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';

type Item = { name: string; role: string; rating: number; quote: string };

export default async function Reviews({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.reviews' });
  const items = t.raw('items') as Item[];

  return (
    <section className="home-section" id="reviews">
      <div className="home-inner">
        <Reveal>
          <h2 className="home-h2">{t('title')}</h2>
        </Reveal>

        <div className="reviews-grid">
          {items.map((r, i) => (
            <Reveal key={i} as="figure" className="review-card" delay={i * 0.07}>
              <div className="review-stars" aria-label={`${r.rating} / 5`}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <span key={j} className={j < r.rating ? '' : 'dim'}>
                    ★
                  </span>
                ))}
              </div>
              <blockquote className="review-quote">“{r.quote}”</blockquote>
              <figcaption className="review-who">
                <span className="review-name">{r.name}</span>
                <span className="review-role">{r.role}</span>
              </figcaption>
            </Reveal>
          ))}
        </div>

        <p className="reviews-disclaimer">{t('disclaimer')}</p>
      </div>
    </section>
  );
}
