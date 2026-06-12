import Link from "next/link";
import { prisma } from "@/lib/db";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE } from "@/lib/admin/route";

type Props = { searchParams: Promise<Record<string, string>> };

export default async function AdminQuestionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const level = sp.level === "ADVANCED" ? "ADVANCED" : "BASIC";
  const moduleId = sp.moduleId ?? "air-law";
  const difficulty = sp.difficulty ?? "";
  const q = sp.q ?? "";

  const where = {
    moduleId,
    ...(difficulty !== "" ? { difficulty: Number(difficulty) } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q } },
            { stemEN: { contains: q } },
            { stemZH: { contains: q } },
          ],
        }
      : {}),
  };
  const select = {
    id: true,
    certLevel: true,
    type: true,
    difficulty: true,
    status: true,
    stemEN: true,
  };
  const rows =
    level === "BASIC"
      ? await prisma.basicQuestionBank.findMany({ where, select, orderBy: { id: "asc" } })
      : await prisma.advancedQuestionBank.findMany({ where, select, orderBy: { id: "asc" } });

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Questions</h1>
        <Link href={`${ADMIN_BASE}/questions/new?level=${level}`} className="btn-primary">
          + New question
        </Link>
      </div>

      {/* Filters */}
      <form method="get" className="admin-filters">
        <select name="level" defaultValue={level}>
          <option value="BASIC">Basic bank</option>
          <option value="ADVANCED">Advanced bank</option>
        </select>
        <select name="moduleId" defaultValue={moduleId}>
          {MODULE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select name="difficulty" defaultValue={difficulty}>
          <option value="">All difficulties</option>
          <option value="0">D0</option>
          <option value="1">D1</option>
          <option value="2">D2</option>
          <option value="3">D3</option>
        </select>
        <input name="q" defaultValue={q} placeholder="Search id / stem…" />
        <button type="submit">Filter</button>
      </form>

      {/* Table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Cert</th>
            <th>Type</th>
            <th>Diff</th>
            <th>Status</th>
            <th>Stem (EN)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-archived={row.status === "ARCHIVED" || undefined}>
              <td className="admin-table-id">{row.id}</td>
              <td>{row.certLevel}</td>
              <td>{row.type}</td>
              <td>D{row.difficulty}</td>
              <td>{row.status}</td>
              <td className="admin-table-stem">{row.stemEN.slice(0, 80)}{row.stemEN.length > 80 ? "…" : ""}</td>
              <td>
                <Link href={`${ADMIN_BASE}/questions/${row.id}?level=${level}`}>Edit</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && <p className="admin-empty">No questions match the current filters.</p>}
    </div>
  );
}
