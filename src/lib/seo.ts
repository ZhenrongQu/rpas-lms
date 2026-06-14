import type { Metadata } from 'next';

export const SITE_URL = 'https://pacificdrone.ca';

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Pacific Drone | Canadian RPAS Training',
  description:
    'Canadian RPAS training for drone pilots preparing for Basic and Advanced certification, mock exams, and flight review support.',
  alternates: {
    canonical: '/en',
    languages: {
      en: '/en',
      zh: '/zh',
      'x-default': '/en',
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/en`,
    siteName: 'Pacific Drone',
    title: 'Pacific Drone | Canadian RPAS Training',
    description:
      'Canadian RPAS training for drone pilots preparing for Basic and Advanced certification, mock exams, and flight review support.',
    locale: 'en_CA',
    alternateLocale: ['zh_CA'],
  },
};
