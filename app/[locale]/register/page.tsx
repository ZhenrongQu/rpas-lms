'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type OAuthStatus = { google: boolean; apple: boolean };

interface PasswordCheck {
  label: string;
  ok: boolean;
}

function getPasswordChecks(pw: string, t: (k: string) => string): PasswordCheck[] {
  return [
    { label: t('pwLength'), ok: pw.length >= 8 && pw.length <= 20 },
    { label: t('pwUpper'), ok: /[A-Z]/.test(pw) },
    { label: t('pwLower'), ok: /[a-z]/.test(pw) },
    { label: t('pwDigit'), ok: /[0-9]/.test(pw) },
    { label: t('pwSpecial'), ok: /[!@#$%^&*()\-_=+[\]{};':",.<>/?\\|`~]/.test(pw) },
  ];
}

function isPasswordValid(pw: string): boolean {
  return (
    pw.length >= 8 && pw.length <= 20 &&
    /[A-Z]/.test(pw) && /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) && /[!@#$%^&*()\-_=+[\]{};':",.<>/?\\|`~]/.test(pw)
  );
}

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pwFocused, setPwFocused] = useState(false);
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
      .catch(() => { if (active) setOauthStatus({ google: false, apple: false }); });
    return () => { active = false; };
  }, []);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      setError(t('pwInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        phone: phone.trim() || undefined,
        username: username.trim() || undefined,
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

  const pwChecks = getPasswordChecks(password, t);

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">// {t('register')}</div>

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

        <form onSubmit={verificationRequested ? verifyEmail : register} className="auth-form">
          {/* Email — required */}
          <label className="auth-label">
            <span>{t('email')} <span className="auth-required">*</span></span>
            <input className="auth-input" type="email" autoComplete="email"
              value={email} required disabled={verificationRequested}
              onChange={(e) => setEmail(e.target.value)} />
          </label>

          {/* Username — optional */}
          <label className="auth-label">
            {t('username')}
            <input className="auth-input" type="text" autoComplete="username"
              placeholder={t('usernamePlaceholder')}
              value={username} disabled={verificationRequested}
              onChange={(e) => setUsername(e.target.value)} />
          </label>

          {/* Phone — optional */}
          <label className="auth-label">
            {t('phone')}
            <input className="auth-input" type="tel" autoComplete="tel"
              placeholder={t('phonePlaceholder')}
              value={phone} disabled={verificationRequested}
              onChange={(e) => setPhone(e.target.value)} />
          </label>

          {/* Password — required */}
          <label className="auth-label">
            <span>{t('password')} <span className="auth-required">*</span></span>
            <input className="auth-input" type="password" autoComplete="new-password"
              value={password} required disabled={verificationRequested}
              onFocus={() => setPwFocused(true)}
              onChange={(e) => setPassword(e.target.value)} />
          </label>

          {/* Password strength checklist */}
          {pwFocused && !verificationRequested && (
            <ul className="pw-rules">
              {pwChecks.map((c, i) => (
                <li key={i} className={c.ok ? 'pw-ok' : 'pw-fail'}>
                  <span className="pw-icon">{c.ok ? '✓' : '○'}</span> {c.label}
                </li>
              ))}
            </ul>
          )}

          {verificationRequested && (
            <>
              <div className="auth-info">{t('emailVerificationRequired')}</div>
              <label className="auth-label">
                {t('code')}
                <input className="auth-input" type="text" inputMode="numeric"
                  value={code} required onChange={(e) => setCode(e.target.value)} />
              </label>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="btn-launch" type="submit"
            disabled={busy || !email || !password || (verificationRequested && !code)}>
            {busy ? t('working') : verificationRequested ? t('verifyEmail') : t('register')}
          </button>
        </form>

        <Link href={`/${locale}/signin`} className="auth-link">{t('haveAccount')}</Link>
      </div>
    </div>
  );
}
