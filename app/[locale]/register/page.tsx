'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';

type Mode = 'email' | 'phone' | 'username';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('email');
  const [target, setTarget] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const channel = mode === 'phone' ? 'sms' : target.includes('@') ? 'email' : 'sms';

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

  async function verify() {
    setBusy(true);
    setError(null);
    const signInResult = await signIn('code', {
      channel,
      target,
      code,
      redirect: false,
    });

    if (signInResult?.error) {
      setBusy(false);
      setError(t('verificationFailed'));
      return;
    }

    if (mode === 'username') {
      const res = await fetch('/api/auth/register/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        setBusy(false);
        setError(t('usernameUnavailable'));
        return;
      }
    }

    setBusy(false);
    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <div className="auth-view">
      <div className="hud-panel auth-card">
        <div className="auth-title">// {t('register')}</div>
        <button type="button" className="btn-launch" onClick={() => signIn('google', { callbackUrl: `/${locale}/dashboard` })}>
          {t('continueGoogle')}
        </button>
        <button type="button" className="btn-launch" onClick={() => signIn('apple', { callbackUrl: `/${locale}/dashboard` })}>
          {t('continueApple')}
        </button>
        <label className="auth-label">{t('emailCode')}
          <input type="radio" checked={mode === 'email'} onChange={() => setMode('email')} />
        </label>
        <label className="auth-label">{t('phoneCode')}
          <input type="radio" checked={mode === 'phone'} onChange={() => setMode('phone')} />
        </label>
        <label className="auth-label">{t('username')}
          <input type="radio" checked={mode === 'username'} onChange={() => setMode('username')} />
        </label>
        {mode === 'username' && (
          <label className="auth-label">{t('username')}
            <input className="auth-input" type="text" value={username} required
              onChange={(e) => setUsername(e.target.value)} />
          </label>
        )}
        <label className="auth-label">{mode === 'phone' ? t('phone') : t('email')}
          <input className="auth-input" type={mode === 'phone' ? 'tel' : 'text'} value={target} required
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
        <button className="btn-launch" type="button" disabled={busy || !codeSent || !code} onClick={verify}>
          {busy ? t('working') : t('verifyCode')}
        </button>
        <Link href={`/${locale}/signin`} className="auth-link">{t('haveAccount')}</Link>
      </div>
    </div>
  );
}
