import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import QuestionEditForm from "./QuestionEditForm";

type Props = { params: Promise<{ id: string }> };

export default async function AdminQuestionEditPage({ params }: Props) {
  const { id } = await params;

  if (id === "new") {
    return <QuestionEditForm question={null} />;
  }

  const row = await prisma.question.findUnique({ where: { id }, include: { options: true } });
  if (!row) notFound();

  return <QuestionEditForm question={row} />;
}
