import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function TrackSplit({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.tracks' });
  const basicPoints = t.raw('basic.points') as string[];
  const advancedPoints = t.raw('advanced.points') as string[];

  return (
    <section className="home-section" id="tracks">
      <div className="home-inner">
        <div className="tracks-head">
          <span className="home-kicker">{t('kicker')}</span>
          <h2 className="home-h2">{t('title')}</h2>
          <p className="home-lead">{t('subtitle')}</p>
        </div>

        <div className="tracks-grid">
          {/* Basic */}
          <article className="track-card">
            <div className="track-top">
              <div className="track-name">{t('basic.name')}</div>
              <span className="track-badge free">{t('basic.badge')}</span>
            </div>
            <p className="track-for">{t('basic.for')}</p>
            <div className="track-block">
              <div className="track-sub">{t('learnTitle')}</div>
              <ul className="track-points">
                {basicPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="track-block">
              <div className="track-sub">{t('examTitle')}</div>
              <div className="track-exam">{t('basic.exam')}</div>
            </div>
            <Link href={`/${locale}/learn/basic`} className="home-btn track-cta">
              {t('basic.cta')} →
            </Link>
          </article>

          {/* Advanced */}
          <article className="track-card advanced">
            <div className="track-top">
              <div className="track-name">{t('advanced.name')}</div>
              <span className="track-badge paid">{t('advanced.badge')}</span>
            </div>
            <p className="track-for">{t('advanced.for')}</p>
            <div className="track-block">
              <div className="track-sub">{t('learnTitle')}</div>
              <ul className="track-points">
                {advancedPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="track-block">
              <div className="track-sub">{t('examTitle')}</div>
              <div className="track-exam">{t('advanced.exam')}</div>
            </div>
            <Link href={`/${locale}/learn/advanced`} className="home-btn-ghost track-cta">
              {t('advanced.cta')} →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
