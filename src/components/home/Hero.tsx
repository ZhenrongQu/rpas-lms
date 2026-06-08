import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import DroneMark from './DroneMark';

export default async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.hero' });
  const stats = t.raw('stats') as { value: string; label: string }[];

  return (
    <section className="home-hero">
      <div className="home-inner hero-grid">
        <div>
          <span className="home-kicker">// {t('kicker')}</span>
          <DroneMark size={48} className="hero-logo" />
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

        {/* TODO: replace this placeholder with a real brand hero image in /public */}
        <div className="hero-media" role="img" aria-label={t('imageAlt')}>
          <DroneMark size={220} className="hero-media-drone" />
          <span className="hero-media-note">{t('imageNote')}</span>
        </div>
      </div>
    </section>
  );
}
