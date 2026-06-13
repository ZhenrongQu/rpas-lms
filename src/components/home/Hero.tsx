import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.hero' });
  const stats = t.raw('stats') as { value: string; label: string }[];

  return (
    <section className="home-hero">
      <div className="home-inner hero-grid">
        <div>
          <span className="hero-eyebrow">
            <span className="dot" />
            {t('kicker')}
          </span>
          <h1 className="hero-name">{t('name')}</h1>
          <div className="hero-slogan">{t('slogan')}</div>
          <p className="hero-lede">{t('lede')}</p>
          <div className="hero-cta">
            <Link href={`/${locale}/register`} className="home-btn">
              {t('ctaPrimary')} →
            </Link>
            <a href="#tracks" className="home-btn-ghost">
              {t('ctaSecondary')}
            </a>
          </div>
          <div className="hero-stats">
            {stats.map((s, i) => (
              <div key={i}>
                <div className="hero-stat-v">{s.value}</div>
                <div className="hero-stat-l">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Placeholder aerial photo. Replace the src with brand drone photography. */}
        <figure className="hero-media">
          <img
            src="https://picsum.photos/seed/rpas-academy-aerial-canada/1200/900"
            alt={t('imageAlt')}
            loading="eager"
          />
          <figcaption className="hero-media-caption">{t('imageNote')}</figcaption>
        </figure>
      </div>
    </section>
  );
}
