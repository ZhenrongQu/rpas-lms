'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type OAuthStatus = { google: boolean; apple: boolean };

function detectIdentifierMode(value: string): 'email' | 'phone' | 'username' {
  if (value.includes('@')) return 'email';
  if (/^\+?[\d\s\-().]{7,}$/.test(value.trim())) return 'phone';
  return 'username';
}

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ google: false, apple: false });

  useEffect(() => {
    let active = true;
    fetch('/api/auth/oauth/status')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!active || !data?.providers) return;
        setOauthStatus({
          google: Boolean(data.providers.google),
          apple: Boolean(data.providers.apple),
        });
      })
      .catch(() => { if (active) setOauthStatus({ google: false, apple: false }); });
    return () => { active = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const mode = detectIdentifierMode(identifier);
    const res = await signIn('credentials', {
      [mode]: identifier.trim(),
      password,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError(t('invalidCredentials'));
      return;
    }
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">// {t('signIn')}</div>

        {(oauthStatus.google || oauthStatus.apple) && (
          <div className="auth-oauth">
            {oauthStatus.google && (
              <button type="button" className="btn-launch"
                onClick={() => signIn('google', { callbackUrl: `/${locale}/dashboard` })}>
                {t('continueGoogle')}
              </button>
            )}
            {oauthStatus.apple && (
              <button type="button" className="btn-launch"
                onClick={() => signIn('apple', { callbackUrl: `/${locale}/dashboard` })}>
                {t('continueApple')}
              </button>
            )}
            <div className="auth-divider"><span>{t('orDivider')}</span></div>
          </div>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            {t('identifier')}
            <input
              className="auth-input"
              type="text"
              autoComplete="username"
              placeholder={t('identifierPlaceholder')}
              value={identifier}
              required
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>
          <label className="auth-label">
            {t('password')}
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-launch" type="submit" disabled={busy || !identifier || !password}>
            {busy ? t('working') : t('signIn')}
          </button>
        </form>

        <Link href={`/${locale}/register`} className="auth-link">{t('needAccount')}</Link>
      </div>
    </div>
  );
}
