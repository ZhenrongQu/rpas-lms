import type { Metadata } from 'next';
import MarketingPage from '@/components/marketing/MarketingPage';
import { getMarketingPage } from '@/lib/marketing/content';
import { SITE_URL } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const content = getMarketingPage('about', locale);

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: {
      canonical: `/${locale}/about`,
      languages: {
        en: '/en/about',
        zh: '/zh/about',
        'x-default': '/en/about',
      },
    },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url: `${SITE_URL}/${locale}/about`,
      type: 'website',
    },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const content = getMarketingPage('about', locale);

  return <MarketingPage content={content} locale={locale} />;
}
