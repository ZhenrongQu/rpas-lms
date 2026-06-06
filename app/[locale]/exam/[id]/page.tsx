import { notFound } from 'next/navigation';
import { examService } from '@/lib/exam/instance';
import ExamClient from './ExamClient';

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ExamPage({ params }: Props) {
  const { locale, id } = await params;
  const meta = await examService.getSessionMeta(id);
  if (!meta) notFound();
  return (
    <ExamClient
      sessionId={id}
      locale={locale}
      expiresAt={meta.expiresAt}
      certLevel={meta.certLevel}
    />
  );
}
