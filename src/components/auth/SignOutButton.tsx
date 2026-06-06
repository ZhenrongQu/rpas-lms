'use client';

import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export default function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations('auth');
  return (
    <button
      type="button"
      className="locale-btn"
      onClick={() => signOut({ callbackUrl: `/${locale}` })}
    >
      {t('signOut')}
    </button>
  );
}
