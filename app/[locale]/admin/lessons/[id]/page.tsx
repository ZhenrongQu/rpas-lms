import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import LessonEditForm from "./LessonEditForm";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminLessonEditPage({ params }: Props) {
  const { locale, id } = await params;
  const row = await prisma.lesson.findUnique({ where: { id } });
  if (!row) notFound();
  return <LessonEditForm locale={locale} lesson={row} />;
}
