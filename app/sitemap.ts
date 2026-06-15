import type { MetadataRoute } from 'next';
import { SITE_URL } from '../src/lib/seo';

const LOCALES = ['en', 'zh'] as const;
const PUBLIC_PATHS = ['', '/about', '/faq', '/terms', '/privacy', '/refund-policy', '/contact'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return LOCALES.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: path === '' ? 'weekly' : 'monthly',
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: {
          en: `${SITE_URL}/en${path}`,
          zh: `${SITE_URL}/zh${path}`,
          'x-default': `${SITE_URL}/en${path}`,
        },
      },
    })),
  );
}
