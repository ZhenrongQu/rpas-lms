'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type CodeMode = 'email' | 'phone';

export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<CodeMode>('email');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const channel = mode === 'phone' ? 'sms' : 'email';

  async function sendCode() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/code/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, target }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t('registerFailed'));
      return;
    }
    setCodeSent(true);
  }

  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('code', { channel, target, code, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError(t('verificationFailed'));
      return;
    }
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false });
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
        <button type="button" className="btn-launch" onClick={() => signIn('google', { callbackUrl: `/${locale}/dashboard` })}>
          {t('continueGoogle')}
        </button>
        <button type="button" className="btn-launch" onClick={() => signIn('apple', { callbackUrl: `/${locale}/dashboard` })}>
          {t('continueApple')}
        </button>

        <form onSubmit={onCodeSubmit}>
          <label className="auth-label">{t('emailCode')}
            <input type="radio" checked={mode === 'email'} onChange={() => setMode('email')} />
          </label>
          <label className="auth-label">{t('phoneCode')}
            <input type="radio" checked={mode === 'phone'} onChange={() => setMode('phone')} />
          </label>
          <label className="auth-label">{mode === 'phone' ? t('phone') : t('email')}
            <input className="auth-input" type={mode === 'phone' ? 'tel' : 'email'} value={target} required
              onChange={(e) => {
                setTarget(e.target.value);
                setCodeSent(false);
              }} />
          </label>
          <button className="btn-launch" type="button" disabled={busy || !target} onClick={sendCode}>
            {busy ? t('working') : t('sendCode')}
          </button>
          {codeSent && <div className="auth-link">{t('codeSent')}</div>}
          <label className="auth-label">{t('code')}
            <input className="auth-input" type="text" inputMode="numeric" value={code} required
              onChange={(e) => setCode(e.target.value)} />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-launch" type="submit" disabled={busy || !codeSent || !code}>
            {busy ? t('working') : t('verifyCode')}
          </button>
        </form>

        <form onSubmit={onPasswordSubmit}>
          <label className="auth-label">{t('email')}
            <input className="auth-input" type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="auth-label">{t('password')}
            <input className="auth-input" type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn-launch" type="submit" disabled={busy}>
            {busy ? t('working') : t('signIn')}
          </button>
        </form>
        <Link href={`/${locale}/register`} className="auth-link">{t('needAccount')}</Link>
      </div>
    </div>
  );
}
