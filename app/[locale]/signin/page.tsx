'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError(t('invalidCredentials'));
      return;
    }
    router.push(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <form className="hud-panel auth-card" onSubmit={onSubmit}>
        <div className="auth-title">// {t('signIn')}</div>
        <label className="auth-label">{t('email')}
          <input className="auth-input" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="auth-label">{t('password')}
          <input className="auth-input" type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-launch" type="submit" disabled={busy}>
          ▶ {busy ? t('working') : t('signIn')}
        </button>
        <Link href={`/${locale}/register`} className="auth-link">{t('needAccount')}</Link>
      </form>
    </div>
  );
}
