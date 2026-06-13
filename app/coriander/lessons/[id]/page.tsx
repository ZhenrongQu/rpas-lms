import { notFound } from "next/navigation";
import { findLessonById } from "@/lib/admin/lessons";
import LessonEditForm from "./LessonEditForm";

type Props = { params: Promise<{ id: string }> };

export default async function AdminLessonEditPage({ params }: Props) {
  const { id } = await params;
  if (id === "new") return <LessonEditForm lesson={null} />;
  const found = await findLessonById(id);
  if (!found) notFound();
  return <LessonEditForm lesson={found.row} />;
}
