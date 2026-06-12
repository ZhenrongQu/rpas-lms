import { notFound } from "next/navigation";
import { findQuestionById } from "@/lib/admin/questions";
import QuestionEditForm from "./QuestionEditForm";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function AdminQuestionEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const initialLevel = sp.level === "ADVANCED" ? "ADVANCED" : "BASIC";

  if (id === "new") {
    return <QuestionEditForm question={null} initialLevel={initialLevel} />;
  }

  const found = await findQuestionById(id);
  if (!found) notFound();

  return <QuestionEditForm question={found.row} initialLevel={found.level} />;
}
