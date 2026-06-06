import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="app">
        <main className="main-content">{children}</main>
      </div>
    </NextIntlClientProvider>
  );
}
