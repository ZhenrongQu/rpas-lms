import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Institutional grotesk display — headlines, brand, section titles.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
});

// --font-editorial is kept as an alias so existing rules keep resolving;
// it now points at the same grotesk display (no serif).
const archivoEditorial = Archivo({
  subsets: ['latin'],
  variable: '--font-editorial',
  weight: ['500', '600', '700'],
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const locale = headersList.get('x-next-intl-locale') ?? 'en';

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} ${archivoEditorial.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
