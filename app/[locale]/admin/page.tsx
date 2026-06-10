import Link from "next/link";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  return (
    <div className="admin-dashboard">
      <h1>Admin CMS</h1>
      <div className="admin-dashboard-cards">
        <Link href={`/${locale}/admin/questions`} className="admin-card">
          <h2>Questions</h2>
          <p>Manage question bank — create, edit, archive</p>
        </Link>
        <Link href={`/${locale}/admin/lessons`} className="admin-card">
          <h2>Lessons</h2>
          <p>Edit lesson content, titles, and MDX bodies</p>
        </Link>
      </div>
    </div>
  );
}
