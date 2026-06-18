import Link from "next/link";
import { prisma } from "@/lib/db";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE } from "@/lib/admin/route";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AdminCheckpointsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const course = sp.course === "advanced" ? "advanced" : sp.course === "basic" ? "basic" : "";
  const moduleId = sp.moduleId && (MODULE_IDS as readonly string[]).includes(sp.moduleId) ? sp.moduleId : "";
  const q = sp.q ?? "";

  const where = {
    ...(course ? { course } : {}),
    ...(moduleId ? { moduleId } : {}),
    ...(q
      ? { OR: [{ id: { contains: q } }, { stemEN: { contains: q } }, { stemZH: { contains: q } }] }
      : {}),
  };

  const rows = await prisma.checkpointQuestion.findMany({
    where,
    select: { id: true, lessonId: true, moduleId: true, order: true, type: true, status: true, stemEN: true },
    orderBy: [{ lessonId: "asc" }, { order: "asc" }, { id: "asc" }],
  });

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Checkpoints</h1>
        <Link href={`${ADMIN_BASE}/checkpoints/new`} className="btn-primary">
          + New checkpoint
        </Link>
      </div>

      <form method="get" className="admin-filters">
        <select name="course" defaultValue={course}>
          <option value="">All courses</option>
          <option value="basic">Basic</option>
          <option value="advanced">Advanced</option>
        </select>
        <select name="moduleId" defaultValue={moduleId}>
          <option value="">All modules</option>
          {MODULE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="Search id / stem…" />
        <button type="submit">Filter</button>
      </form>

      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Lesson</th>
            <th>Module</th>
            <th>Order</th>
            <th>Type</th>
            <th>Status</th>
            <th>Stem (EN)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-archived={row.status === "ARCHIVED" || undefined}>
              <td className="admin-table-id">{row.id}</td>
              <td className="admin-table-id">{row.lessonId}</td>
              <td>{row.moduleId}</td>
              <td>{row.order}</td>
              <td>{row.type}</td>
              <td>{row.status}</td>
              <td className="admin-table-stem">
                {row.stemEN.slice(0, 80)}
                {row.stemEN.length > 80 ? "…" : ""}
              </td>
              <td>
                <Link href={`${ADMIN_BASE}/checkpoints/${row.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && <p className="admin-empty">No checkpoints match the current filters.</p>}
    </div>
  );
}
