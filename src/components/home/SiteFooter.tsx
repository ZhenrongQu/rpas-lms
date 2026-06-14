import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import DroneMark from './DroneMark';

export default async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'home.footer' });
  const year = new Date().getFullYear();
  const isChinese = locale === 'zh';

  return (
    <footer className="home-footer">
      <div className="home-inner">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-row">
              <DroneMark size={30} />
              <span className="footer-logo-text">PACIFIC DRONE</span>
            </div>
            <div className="footer-tagline">{t('tagline')}</div>
            <p className="footer-blurb">{t('blurb')}</p>
            {/* Social placeholders - clearly sample links */}
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
              <Link href={`/${locale}/terms`} className="footer-link">{isChinese ? '使用条款' : 'Terms of Service'}</Link>
              <Link href={`/${locale}/privacy`} className="footer-link">{isChinese ? '隐私政策' : 'Privacy Policy'}</Link>
              <Link href={`/${locale}/refund-policy`} className="footer-link">{isChinese ? '退款政策' : 'Refund Policy'}</Link>
              <Link href={`/${locale}/contact`} className="footer-link">{isChinese ? '联系与法律通知' : 'Contact / Legal Notice'}</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">{t('contactTitle')}</div>
            <div className="footer-contact">
              <span>info@pacificdrone.ca</span>
              <span>{isChinese ? '加拿大不列颠哥伦比亚省' : 'British Columbia, Canada'}</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">(c) {year} {t('rights')}</span>
          <span className="footer-disclaimer">{t('disclaimer')}</span>
        </div>
      </div>
    </footer>
  );
}
