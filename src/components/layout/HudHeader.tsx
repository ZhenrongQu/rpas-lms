'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SignOutButton from '@/components/auth/SignOutButton';

export default function HudHeader({
  locale,
  user,
}: {
  locale: string;
  user: { name?: string | null; email?: string | null } | null;
}) {
  const t = useTranslations('nav');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();

  const isModules = pathname === `/${locale}` || pathname === `/${locale}/`;
  const isExam = pathname.startsWith(`/${locale}/exam`);

  // Same path under a target locale, swapping the leading locale segment.
  const localeHref = (target: string) =>
    pathname.replace(new RegExp(`^/${locale}`), `/${target}`);

  return (
    <header className="hud-header">
      {/* Logo */}
      <div className="logo-mark">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" style={{ filter: 'drop-shadow(0 0 8px #00d4ff)' }}>
          <line x1="20" y1="20" x2="8"  y2="8"  stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="8"  stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="8"  y2="32" stroke="#00d4ff" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="32" stroke="#00d4ff" strokeWidth="1.5"/>
          <circle cx="8"  cy="8"  r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="32" cy="8"  r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="8"  cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <circle cx="32" cy="32" r="5" stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.6"/>
          <rect x="15" y="15" width="10" height="10" rx="2" fill="#00d4ff" fillOpacity="0.15" stroke="#00d4ff" strokeWidth="1"/>
          <circle cx="20" cy="20" r="2" fill="#00d4ff"/>
        </svg>
        <div>
          <div className="logo-text">RPAS ACADEMY</div>
          <div className="logo-sub">Transport Canada · TP-15263</div>
        </div>
      </div>

      <div className="header-divider" />

      <div className="header-stat">
        <div className="stat-label">Status</div>
        <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="status-blip" />
          ACTIVE
        </div>
      </div>

      <div className="header-spacer" />

      {/* Radar widget */}
      <div className="radar-widget">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="20" stroke="rgba(0,212,255,0.12)" strokeWidth="1" fill="none"/>
          <circle cx="22" cy="22" r="13" stroke="rgba(0,212,255,0.08)" strokeWidth="1" fill="none"/>
          <circle cx="22" cy="22" r="6"  stroke="rgba(0,212,255,0.10)" strokeWidth="1" fill="none"/>
          <line x1="2" y1="22" x2="42" y2="22" stroke="rgba(0,212,255,0.06)" strokeWidth="1"/>
          <line x1="22" y1="2" x2="22" y2="42" stroke="rgba(0,212,255,0.06)" strokeWidth="1"/>
          <g className="radar-sweep">
            <line x1="22" y1="22" x2="22" y2="2" stroke="rgba(0,212,255,0.7)" strokeWidth="1"/>
            <path d="M22 22 L22 2 A20 20 0 0 1 38 32 Z" fill="rgba(0,212,255,0.05)"/>
          </g>
          <circle cx="30" cy="14" r="2" fill="#00d4ff" className="radar-blip"/>
        </svg>
      </div>

      <div className="cert-badge">ADVANCED OPS</div>

      {/* Nav tabs */}
      <nav className="nav-tabs">
        <Link href={`/${locale}`} className={`nav-tab${isModules ? ' active' : ''}`}>
          {t('modules')}
        </Link>
        <Link href={`/${locale}/exam`} className={`nav-tab${isExam ? ' active' : ''}`}>
          {t('exam')}
        </Link>
      </nav>

      {/* Account */}
      <div className="account-box">
        {user ? (
          <>
            <span className="account-name">{user.name || user.email}</span>
            <SignOutButton locale={locale} />
          </>
        ) : (
          <Link href={`/${locale}/signin`} className="locale-btn">
            {tAuth('signIn')}
          </Link>
        )}
      </div>

      {/* Locale switcher */}
      <div className="locale-switcher">
        <Link href={localeHref('en')} className={`locale-btn${locale === 'en' ? ' active' : ''}`}>
          EN
        </Link>
        <Link href={localeHref('zh')} className={`locale-btn${locale === 'zh' ? ' active' : ''}`}>
          ZH
        </Link>
      </div>
    </header>
  );
}
