import { notFound } from "next/navigation";
import { findCheckpointById, listLessonOptions } from "@/lib/admin/checkpoints";
import CheckpointEditForm from "./CheckpointEditForm";

type Props = { params: Promise<{ id: string }> };

export default async function AdminCheckpointEditPage({ params }: Props) {
  const { id } = await params;
  const lessons = await listLessonOptions();

  if (id === "new") {
    return <CheckpointEditForm checkpoint={null} lessons={lessons} />;
  }

  const row = await findCheckpointById(id);
  if (!row) notFound();

  return <CheckpointEditForm checkpoint={row} lessons={lessons} />;
}
