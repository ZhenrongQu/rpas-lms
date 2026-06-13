import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';

/**
 * Renders a track name with the parenthetical English label on its own line.
 * Names without a full-width paren (e.g. the English locale) render unchanged.
 */
function TrackName({ name }: { name: string }) {
  const i = name.indexOf('（');
  if (i === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, i)}
      <span className="track-name-en">{name.slice(i)}</span>
    </>
  );
}

export default async function TrackSplit({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.tracks' });
  const basicPoints = t.raw('basic.points') as string[];
  const advancedPoints = t.raw('advanced.points') as string[];
  const reviewPoints = t.raw('flightReview.points') as string[];

  return (
    <section className="home-section" id="tracks">
      <div className="home-inner">
        <Reveal className="tracks-head">
          <span className="home-kicker">{t('kicker')}</span>
          <h2 className="home-h2">{t('title')}</h2>
          <p className="home-lead">{t('subtitle')}</p>
        </Reveal>

        <div className="tracks-grid">
          {/* Basic */}
          <Reveal as="article" className="track-card basic" delay={0}>
            <div className="track-top">
              <div className="track-name"><TrackName name={t('basic.name')} /></div>
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
          </Reveal>

          {/* Advanced */}
          <Reveal as="article" className="track-card advanced" delay={0.08}>
            <div className="track-top">
              <div className="track-name"><TrackName name={t('advanced.name')} /></div>
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
          </Reveal>

          {/* Flight Review */}
          <Reveal as="article" className="track-card flight-review" delay={0.16}>
            <div className="track-top">
              <div className="track-name"><TrackName name={t('flightReview.name')} /></div>
              <span className="track-badge paid">{t('flightReview.badge')}</span>
            </div>
            <p className="track-for">{t('flightReview.for')}</p>
            <div className="track-block">
              <div className="track-sub">{t('flightReview.reviewTitle')}</div>
              <ul className="track-points">
                {reviewPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="track-block">
              <div className="track-sub">Format</div>
              <div className="track-exam">{t('flightReview.duration')}</div>
            </div>
            <a href="#" className="home-btn-ghost track-cta fr-cta">
              {t('flightReview.cta')} →
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
