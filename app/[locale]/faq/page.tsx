import type { Metadata } from 'next';
import MarketingPage from '@/components/marketing/MarketingPage';
import { getMarketingPage } from '@/lib/marketing/content';
import { SITE_URL } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const content = getMarketingPage('faq', locale);

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: {
      canonical: `/${locale}/faq`,
      languages: {
        en: '/en/faq',
        zh: '/zh/faq',
        'x-default': '/en/faq',
      },
    },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url: `${SITE_URL}/${locale}/faq`,
      type: 'website',
    },
  };
}

export default async function FAQPage({ params }: Props) {
  const { locale } = await params;
  const content = getMarketingPage('faq', locale);

  return <MarketingPage content={content} locale={locale} />;
}
