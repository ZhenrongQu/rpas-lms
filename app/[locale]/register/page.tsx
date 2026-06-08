'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type OAuthStatus = { google: boolean; apple: boolean };

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [verificationRequested, setVerificationRequested] = useState(false);
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

  function optional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        phone: optional(phone),
        username: optional(username),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t('registerFailed'));
      return;
    }
    setVerificationRequested(true);
  }

  async function verifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/register/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      setBusy(false);
      setError(t('verificationFailed'));
      return;
    }

    const signInResult = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (signInResult?.error) {
      setError(t('invalidCredentials'));
      return;
    }
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">// {t('register')}</div>
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

        <form onSubmit={verificationRequested ? verifyEmail : register}>
          <label className="auth-label">{t('email')}
            <input className="auth-input" type="email" value={email} required disabled={verificationRequested}
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="auth-label">{t('password')}
            <input className="auth-input" type="password" value={password} required disabled={verificationRequested}
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="auth-label">{t('phone')}
            <input className="auth-input" type="tel" value={phone} disabled={verificationRequested}
              onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="auth-label">{t('username')}
            <input className="auth-input" type="text" value={username} disabled={verificationRequested}
              onChange={(e) => setUsername(e.target.value)} />
          </label>

          {verificationRequested && (
            <>
              <div className="auth-link">{t('emailVerificationRequired')}</div>
              <label className="auth-label">{t('code')}
                <input className="auth-input" type="text" inputMode="numeric" value={code} required
                  onChange={(e) => setCode(e.target.value)} />
              </label>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
          <button className="btn-launch" type="submit" disabled={busy || !email || !password || (verificationRequested && !code)}>
            {busy ? t('working') : verificationRequested ? t('verifyEmail') : t('register')}
          </button>
        </form>

        <Link href={`/${locale}/signin`} className="auth-link">{t('haveAccount')}</Link>
      </div>
    </div>
  );
}
