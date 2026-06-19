'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { PASSWORD_RULES, isPasswordValid } from '@/lib/auth/passwordPolicy';

function ResetForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwFocused, setPwFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!email || !token) {
    return (
      <>
        <div className="auth-error">{t('resetLinkInvalid')}</div>
        <Link href={`/${locale}/forgot-password`} className="auth-link">{t('forgotPasswordTitle')}</Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <div className="auth-info">{t('resetSuccess')}</div>
        <Link href={`/${locale}/signin`} className="auth-link">{t('backToSignIn')}</Link>
      </>
    );
  }

  const checks = PASSWORD_RULES.map((r) => ({ label: t(r.key), ok: r.test(password) }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      setError(t('pwInvalid'));
      return;
    }
    if (password !== confirm) {
      setError(t('pwMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword: password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error === 'weak_password' ? t('err.password_weak') : t('resetLinkInvalid'));
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <label className="auth-label">
        {t('newPassword')}
        <input
          className="auth-input"
          type="password"
          autoComplete="new-password"
          value={password}
          required
          onFocus={() => setPwFocused(true)}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {pwFocused && (
        <ul className="pw-rules">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? 'pw-ok' : 'pw-fail'}>
              <span className="pw-icon">{c.ok ? '✓' : '○'}</span> {c.label}
            </li>
          ))}
        </ul>
      )}
      <label className="auth-label">
        {t('confirmNewPassword')}
        <input
          className="auth-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          required
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button className="btn-launch" type="submit" disabled={busy || !password || !confirm}>
        {busy ? t('working') : t('resetPassword')}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">{t('resetPasswordTitle')}</div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
