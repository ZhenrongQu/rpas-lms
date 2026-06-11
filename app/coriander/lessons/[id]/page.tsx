import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import LessonEditForm from "./LessonEditForm";

type Props = { params: Promise<{ id: string }> };

export default async function AdminLessonEditPage({ params }: Props) {
  const { id } = await params;
  const row = await prisma.lesson.findUnique({ where: { id } });
  if (!row) notFound();
  return <LessonEditForm lesson={row} />;
}
