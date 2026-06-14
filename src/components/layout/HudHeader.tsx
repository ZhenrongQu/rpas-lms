'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';

function UserMenu({
  user,
  locale,
}: {
  user: { name?: string | null; email?: string | null };
  locale: string;
}) {
  const t = useTranslations('auth');
  const tNav = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const displayName = user.name || user.email || '';

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="account-name"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="account-dot" />
        {displayName}
        <span className="account-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-header">
            <div className="user-dropdown-name">{displayName}</div>
            <div className="user-dropdown-email">{user.email}</div>
          </div>
          <div className="user-dropdown-divider" />
          <Link
            href={`/${locale}/dashboard`}
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            {tNav('dashboard')}
          </Link>
          <button
            type="button"
            className="user-dropdown-item danger"
            onClick={() => signOut({ callbackUrl: `/${locale}` })}
          >
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

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

  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`;

  const localeHref = (target: string) =>
    pathname.replace(new RegExp(`^/${locale}`), `/${target}`);

  const handleHashNav = (hash: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isHome) {
      e.preventDefault();
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="hud-header">
      {/* Logo */}
      <Link href={`/${locale}`} className="logo-mark">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <line x1="20" y1="20" x2="8"  y2="8"  stroke="#14213D" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="8"  stroke="#14213D" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="8"  y2="32" stroke="#14213D" strokeWidth="1.5"/>
          <line x1="20" y1="20" x2="32" y2="32" stroke="#14213D" strokeWidth="1.5"/>
          <circle cx="8"  cy="8"  r="5" stroke="#14213D" strokeWidth="1" fill="none" opacity="0.45"/>
          <circle cx="32" cy="8"  r="5" stroke="#14213D" strokeWidth="1" fill="none" opacity="0.45"/>
          <circle cx="8"  cy="32" r="5" stroke="#14213D" strokeWidth="1" fill="none" opacity="0.45"/>
          <circle cx="32" cy="32" r="5" stroke="#14213D" strokeWidth="1" fill="none" opacity="0.45"/>
          <rect x="15" y="15" width="10" height="10" rx="2" fill="#B8501E" fillOpacity="0.12" stroke="#B8501E" strokeWidth="1"/>
          <circle cx="20" cy="20" r="2" fill="#B8501E"/>
        </svg>
        <div>
          <div className="logo-text">PACIFIC DRONE</div>
          <div className="logo-sub">Transport Canada · TP-15263</div>
        </div>
      </Link>

      <div className="header-spacer" />

      {/* Nav tabs */}
      <nav className="nav-tabs">
        <Link href={`/${locale}`} className={`nav-tab${isHome ? ' active' : ''}`}>
          {t('home')}
        </Link>
        <Link
          href={`/${locale}#tracks`}
          className="nav-tab"
          onClick={handleHashNav('tracks')}
        >
          {t('services')}
        </Link>
        <Link
          href={`/${locale}#how`}
          className="nav-tab"
          onClick={handleHashNav('how')}
        >
          {t('about')}
        </Link>
      </nav>

      {/* Account */}
      {user ? (
        <UserMenu user={user} locale={locale} />
      ) : (
        <div className="auth-links">
          <Link href={`/${locale}/signin`} className="nav-tab">
            {tAuth('signIn')}
          </Link>
          <Link href={`/${locale}/register`} className="nav-tab-cta">
            {tAuth('register')}
          </Link>
        </div>
      )}

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
