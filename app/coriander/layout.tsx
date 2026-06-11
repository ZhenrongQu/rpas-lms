import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { ADMIN_BASE } from "@/lib/admin/route";
import { routing } from "@/i18n/routing";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <Link href={ADMIN_BASE} className="admin-nav-brand">
          CMS
        </Link>
        <Link href={`${ADMIN_BASE}/questions`} className="admin-nav-link">
          Questions
        </Link>
        <Link href={`${ADMIN_BASE}/lessons`} className="admin-nav-link">
          Lessons
        </Link>
        <Link href={`/${routing.defaultLocale}/dashboard`} className="admin-nav-back">
          ← Back to site
        </Link>
      </nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
