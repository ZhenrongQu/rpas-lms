'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const tErr = useTranslations('auth.err');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEmailError(null);
    let res: Response | null = null;
    try {
      res = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), locale }),
      });
    } catch {
      res = null;
    }
    setBusy(false);
    // Only a malformed email is surfaced — it leaks nothing about account
    // existence. Every well-formed request shows the same uniform notice.
    if (res && res.status === 400) {
      const data = await res.json().catch(() => null);
      const code = data?.fields?.email;
      if (code === 'email_invalid' || code === 'email_required') {
        setEmailError(code);
        return;
      }
    }
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
              {emailError && <span className="auth-field-error">{tErr(emailError)}</span>}
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
