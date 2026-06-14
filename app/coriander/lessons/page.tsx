import Link from "next/link";
import { prisma } from "@/lib/db";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE } from "@/lib/admin/route";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AdminLessonsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const course = sp.course ?? "";
  const moduleId = sp.moduleId ?? "";
  const access = sp.access ?? "";

  const where = {
    ...(moduleId ? { moduleId } : {}),
    ...(access ? { access } : {}),
  };
  const select = {
    id: true,
    lessonId: true,
    course: true,
    moduleId: true,
    slug: true,
    order: true,
    certLevel: true,
    access: true,
    titleEN: true,
  };
  const orderBy = [{ moduleId: "asc" as const }, { order: "asc" as const }];
  const [basic, advanced] = await Promise.all([
    course === "advanced" ? [] : prisma.basicLesson.findMany({ where, select, orderBy }),
    course === "basic" ? [] : prisma.advancedLesson.findMany({ where, select, orderBy }),
  ]);
  const rows = [...basic, ...advanced];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Lessons</h1>
        <Link href={`${ADMIN_BASE}/lessons/new`} className="btn-primary">
          + New lesson
        </Link>
      </div>

      {/* Filters */}
      <form method="get" className="admin-filters">
        <select name="course" defaultValue={course}>
          <option value="">All courses</option>
          <option value="basic">basic</option>
          <option value="advanced">advanced</option>
        </select>
        <select name="moduleId" defaultValue={moduleId}>
          <option value="">All modules</option>
          {MODULE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select name="access" defaultValue={access}>
          <option value="">All access</option>
          <option value="FREE">FREE</option>
          <option value="PAID">PAID</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      {/* Table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Course</th>
            <th>Module</th>
            <th>Slug</th>
            <th>Cert</th>
            <th>Access</th>
            <th>Title (EN)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.order}</td>
              <td>{row.course}</td>
              <td>{row.moduleId}</td>
              <td>{row.slug}</td>
              <td>{row.certLevel}</td>
              <td>{row.access}</td>
              <td>{row.titleEN}</td>
              <td>
                <Link href={`${ADMIN_BASE}/lessons/${row.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && <p className="admin-empty">No lessons match the current filters.</p>}
    </div>
  );
}
