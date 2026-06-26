'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';

export default function DeleteAccountForm({ locale }: { locale: string }) {
  const t = useTranslations('dashboard');
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmWord = t('deleteAccountConfirmWord');
  const canDelete = confirm.trim() === confirmWord && !busy;

  async function onDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (!res.ok) {
      setBusy(false);
      setError(t('deleteAccountFailed'));
      return;
    }
    // Account is gone — clear the session and return to the landing page.
    await signOut({ callbackUrl: `/${locale}` });
  }

  if (!open) {
    return (
      <button type="button" className="btn-danger-ghost" onClick={() => setOpen(true)}>
        {t('deleteAccount')}
      </button>
    );
  }

  return (
    <div className="delete-account">
      <p className="delete-account-warning">{t('deleteAccountWarning')}</p>
      <label className="auth-label">
        {t('deleteAccountConfirmLabel')}
        <input
          className="auth-input"
          type="text"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button type="button" className="btn-danger" onClick={onDelete} disabled={!canDelete}>
        {busy ? t('deleteAccountWorking') : t('deleteAccountButton')}
      </button>
    </div>
  );
}
