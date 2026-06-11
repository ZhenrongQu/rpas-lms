import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth/adminGuard";
import { ADMIN_BASE } from "@/lib/admin/route";
import { routing } from "@/i18n/routing";
import AdminLogin from "./AdminLogin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  // Not an admin (logged out or wrong role): show a generic sign-in instead of
  // the CMS. children are never rendered, so admin pages stay gated.
  if (!admin) {
    return (
      <div className="admin-layout">
        <main className="admin-main">
          <AdminLogin />
        </main>
      </div>
    );
  }

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
