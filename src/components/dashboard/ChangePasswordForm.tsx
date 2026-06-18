'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PASSWORD_RULES, isPasswordValid } from '@/lib/auth/passwordPolicy';

export default function ChangePasswordForm() {
  const t = useTranslations('auth');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwFocused, setPwFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const checks = PASSWORD_RULES.map((r) => ({ label: t(r.key), ok: r.test(newPassword) }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!isPasswordValid(newPassword)) {
      setError(t('pwInvalid'));
      return;
    }
    if (newPassword !== confirm) {
      setError(t('pwMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        data?.error === 'wrong_password'
          ? t('wrongCurrentPassword')
          : data?.error === 'no_password_set'
            ? t('noPasswordSet')
            : t('changePasswordFailed'),
      );
      return;
    }
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <label className="auth-label">
        {t('currentPassword')}
        <input
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={oldPassword}
          required
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </label>
      <label className="auth-label">
        {t('newPassword')}
        <input
          className="auth-input"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          required
          onFocus={() => setPwFocused(true)}
          onChange={(e) => setNewPassword(e.target.value)}
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
      {done && <div className="auth-info">{t('passwordUpdated')}</div>}
      <button
        className="btn-launch"
        type="submit"
        disabled={busy || !oldPassword || !newPassword || !confirm}
      >
        {busy ? t('working') : t('updatePassword')}
      </button>
    </form>
  );
}
