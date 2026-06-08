import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import DroneMark from './DroneMark';

export default async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.footer' });
  const year = new Date().getFullYear();

  return (
    <footer className="home-footer">
      <div className="home-inner">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-row">
              <DroneMark size={30} />
              <span className="footer-logo-text">RPAS ACADEMY</span>
            </div>
            <div className="footer-tagline">{t('tagline')}</div>
            <p className="footer-blurb">{t('blurb')}</p>
            {/* Social placeholders — clearly sample links */}
            <div className="footer-socials">
              {['X', 'IG', 'YT'].map((s) => (
                <a key={s} href="#" className="footer-social" aria-label={`${s} (sample)`}>
                  {s}
                </a>
              ))}
            </div>
          </div>

          <div>
            <div className="footer-col-title">{t('exploreTitle')}</div>
            <div className="footer-links">
              <Link href={`/${locale}`} className="footer-link">{t('linkHome')}</Link>
              <Link href={`/${locale}/learn/basic`} className="footer-link">{t('linkBasic')}</Link>
              <Link href={`/${locale}/learn/advanced`} className="footer-link">{t('linkAdvanced')}</Link>
              <Link href={`/${locale}/exam`} className="footer-link">{t('linkExam')}</Link>
              <Link href={`/${locale}/dashboard`} className="footer-link">{t('linkDashboard')}</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">{t('resourcesTitle')}</div>
            <div className="footer-links">
              <a href="#" className="footer-link">{t('resTP')}</a>
              <a href="#" className="footer-link">{t('resFaq')}</a>
              <a href="#" className="footer-link">{t('resPricing')}</a>
              <a href="#" className="footer-link">{t('resContact')}</a>
            </div>
          </div>

          <div>
            <div className="footer-col-title">{t('contactTitle')}</div>
            <div className="footer-contact">
              <span>{t('email')}<span className="sample">{t('sampleTag')}</span></span>
              <span>{t('phone')}<span className="sample">{t('sampleTag')}</span></span>
              <span>{t('address')}<span className="sample">{t('sampleTag')}</span></span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">© {year} {t('rights')}</span>
          <span className="footer-disclaimer">{t('disclaimer')}</span>
        </div>
      </div>
    </footer>
  );
}
