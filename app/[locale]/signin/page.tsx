'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type LoginMode = 'email' | 'phone' | 'username';
type OAuthStatus = { google: boolean; apple: boolean };

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('email');
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
      .catch(() => {
        if (active) setOauthStatus({ google: false, apple: false });
      });
    return () => {
      active = false;
    };
  }, []);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', {
      [mode]: identifier,
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
        <button
          type="button"
          className="btn-launch"
          disabled={!oauthStatus.google}
          title={!oauthStatus.google ? t('oauthUnavailable') : undefined}
          onClick={() => signIn('google', { callbackUrl: `/${locale}/dashboard` })}
        >
          {t('continueGoogle')}
        </button>
        <button
          type="button"
          className="btn-launch"
          disabled={!oauthStatus.apple}
          title={!oauthStatus.apple ? t('oauthUnavailable') : undefined}
          onClick={() => signIn('apple', { callbackUrl: `/${locale}/dashboard` })}
        >
          {t('continueApple')}
        </button>

        <form onSubmit={onPasswordSubmit}>
          <div className="auth-label">{t('identifierType')}</div>
          <label className="auth-label">{t('loginWithEmail')}
            <input type="radio" checked={mode === 'email'} onChange={() => setMode('email')} />
          </label>
          <label className="auth-label">{t('loginWithPhone')}
            <input type="radio" checked={mode === 'phone'} onChange={() => setMode('phone')} />
          </label>
          <label className="auth-label">{t('loginWithUsername')}
            <input type="radio" checked={mode === 'username'} onChange={() => setMode('username')} />
          </label>
          <label className="auth-label">{mode === 'phone' ? t('phone') : mode === 'username' ? t('username') : t('email')}
            <input className="auth-input" type={mode === 'phone' ? 'tel' : mode === 'email' ? 'email' : 'text'} value={identifier} required
              onChange={(e) => setIdentifier(e.target.value)} />
          </label>
          <label className="auth-label">{t('password')}
            <input className="auth-input" type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
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
