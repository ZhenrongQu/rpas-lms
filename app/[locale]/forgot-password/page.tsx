'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Ignore the response body on purpose — the endpoint is intentionally
    // uniform (no account enumeration), so we always show the same notice.
    await fetch('/api/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), locale }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">{t('forgotPasswordTitle')}</div>

        {sent ? (
          <>
            <div className="auth-info">{t('resetLinkSent')}</div>
            <Link href={`/${locale}/signin`} className="auth-link">{t('backToSignIn')}</Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-info">{t('forgotPasswordInstruction')}</div>
            <label className="auth-label">
              {t('email')}
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="btn-launch" type="submit" disabled={busy || !email}>
              {busy ? t('working') : t('sendResetLink')}
            </button>
            <Link href={`/${locale}/signin`} className="auth-link">{t('backToSignIn')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
