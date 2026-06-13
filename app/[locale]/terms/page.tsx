import { notFound } from 'next/navigation';
import LegalPage from '@/components/legal/LegalPage';
import { getLegalPage } from '@/lib/legal/content';

type Props = { params: Promise<{ locale: string }> };

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  const content = getLegalPage('terms');

  if (!content) notFound();

  return <LegalPage content={content} locale={locale} />;
}
