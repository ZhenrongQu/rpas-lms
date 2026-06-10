import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/adminGuard";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireAdmin(locale);

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <Link href={`/${locale}/admin`} className="admin-nav-brand">
          CMS
        </Link>
        <Link href={`/${locale}/admin/questions`} className="admin-nav-link">
          Questions
        </Link>
        <Link href={`/${locale}/admin/lessons`} className="admin-nav-link">
          Lessons
        </Link>
        <Link href={`/${locale}/dashboard`} className="admin-nav-back">
          ← Back to site
        </Link>
      </nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
