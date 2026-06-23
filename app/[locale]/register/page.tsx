'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { PASSWORD_RULES, isPasswordValid } from '@/lib/auth/passwordPolicy';

type OAuthStatus = { google: boolean; apple: boolean };

// Error codes the register API can return per field (see app/api/auth/register/route.ts),
// each mapped to a localized hint under the `auth.err.*` i18n keys.
const FIELD_ERR_CODES = new Set([
  'email_required', 'email_invalid', 'password_required',
  'password_length', 'password_weak', 'username_length', 'username_charset', 'phone_length',
]);

export default function RegisterPage() {
  const t = useTranslations('auth');
  const tErr = useTranslations('auth.err');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwFocused, setPwFocused] = useState(false);
  const [code, setCode] = useState('');
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ google: false, apple: false });

  // Resend cooldown: tick down one second at a time until it reaches 0.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

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

  // Re-requesting /api/auth/register for an unverified account re-issues the
  // email code (it invalidates the old one), so both the initial request and
  // the resend hit the same endpoint.
  async function requestCode(): Promise<{ ok: boolean; fields?: Record<string, string> }> {
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
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return { ok: false, fields: data?.fields };
  }

  // Show inline field hints when the API reports validation codes; otherwise fall
  // back to the generic message (e.g. duplicate email / server error).
  function applyRequestError(result: { fields?: Record<string, string> }) {
    if (result.fields && Object.keys(result.fields).length > 0) {
      setFieldErrors(result.fields);
      setError(null);
    } else {
      setError(t('registerFailed'));
    }
  }

  // Render a localized hint for a field, ignoring any unrecognized code.
  function fieldHint(field: string) {
    const code = fieldErrors[field];
    if (!code || !FIELD_ERR_CODES.has(code)) return null;
    return <span className="auth-field-error">{tErr(code)}</span>;
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    if (!isPasswordValid(password)) {
      setError(t('pwInvalid'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('pwMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestCode();
    setBusy(false);
    if (!result.ok) {
      applyRequestError(result);
      return;
    }
    setVerificationRequested(true);
    setResendIn(60);
  }

  async function resendCode() {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await requestCode();
    setBusy(false);
    if (!result.ok) {
      applyRequestError(result);
      return;
    }
    setResendIn(60);
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

  const pwChecks = PASSWORD_RULES.map((r) => ({ label: t(r.key), ok: r.test(password) }));

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">{t('register')}</div>

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
            {fieldHint('email')}
          </label>

          {/* Username — optional */}
          <label className="auth-label">
            {t('username')}
            <input className="auth-input" type="text" autoComplete="username"
              placeholder={t('usernamePlaceholder')}
              value={username} disabled={verificationRequested}
              onChange={(e) => setUsername(e.target.value)} />
            {fieldHint('username')}
          </label>

          {/* Phone — optional */}
          <label className="auth-label">
            {t('phone')}
            <input className="auth-input" type="tel" autoComplete="tel"
              placeholder={t('phonePlaceholder')}
              value={phone} disabled={verificationRequested}
              onChange={(e) => setPhone(e.target.value)} />
            {fieldHint('phone')}
          </label>

          {/* Password — required */}
          <label className="auth-label">
            <span>{t('password')} <span className="auth-required">*</span></span>
            <input className="auth-input" type="password" autoComplete="new-password"
              value={password} required disabled={verificationRequested}
              onFocus={() => setPwFocused(true)}
              onChange={(e) => setPassword(e.target.value)} />
            {fieldHint('password')}
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

          {/* Confirm password — required */}
          <label className="auth-label">
            <span>{t('confirmPassword')} <span className="auth-required">*</span></span>
            <input className="auth-input" type="password" autoComplete="new-password"
              value={confirmPassword} required disabled={verificationRequested}
              onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>

          {verificationRequested && (
            <>
              <div className="auth-info">{t('emailVerificationRequired')}</div>
              <label className="auth-label">
                {t('code')}
                <input className="auth-input" type="text" inputMode="numeric"
                  value={code} required onChange={(e) => setCode(e.target.value)} />
              </label>
              <button type="button" className="auth-link"
                onClick={resendCode} disabled={resendIn > 0 || busy}>
                {resendIn > 0 ? t('resendCodeIn', { seconds: resendIn }) : t('resendCode')}
              </button>
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
