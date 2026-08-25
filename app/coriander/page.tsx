import Link from "next/link";
import { ADMIN_BASE } from "@/lib/admin/route";

export default function AdminPage() {
  return (
    <div className="admin-dashboard">
      <h1>Admin CMS</h1>
      <div className="admin-dashboard-cards">
        <Link href={`${ADMIN_BASE}/questions`} className="admin-card">
          <h2>Questions</h2>
          <p>Manage question bank — create, edit, archive</p>
        </Link>
        <Link href={`${ADMIN_BASE}/lessons`} className="admin-card">
          <h2>Lessons</h2>
          <p>Edit lesson content, titles, and MDX bodies</p>
        </Link>
        <Link href={`${ADMIN_BASE}/flight-review`} className="admin-card">
          <h2>Flight Reviews</h2>
          <p>Manage bookable slots and student review credits</p>
        </Link>
        <Link href={`${ADMIN_BASE}/audit`} className="admin-card">
          <h2>Entitlement audit</h2>
          <p>Find customers whose access tier and entitlements disagree</p>
        </Link>
        <Link href={`${ADMIN_BASE}/refunds`} className="admin-card">
          <h2>Refunds</h2>
          <p>Review refund requests — approve, refund, and withdraw access</p>
        </Link>
      </div>
    </div>
  );
}
