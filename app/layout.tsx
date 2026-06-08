import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Orbitron, Rajdhani, Share_Tech_Mono, Fraunces } from 'next/font/google';
import './globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '900'],
});

// Editorial display serif — used by the marketing Home page (--font-editorial).
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-editorial',
  weight: ['400', '500', '600', '700', '900'],
  style: ['normal', 'italic'],
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  variable: '--font-ui',
  weight: ['300', '400', '500', '600', '700'],
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: '400',
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const locale = headersList.get('x-next-intl-locale') ?? 'en';

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${orbitron.variable} ${rajdhani.variable} ${shareTechMono.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
