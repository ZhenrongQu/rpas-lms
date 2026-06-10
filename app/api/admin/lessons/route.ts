import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";

/** GET /api/admin/lessons?course=&moduleId=&access= */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const course = url.searchParams.get("course") ?? undefined;
  const moduleId = url.searchParams.get("moduleId") ?? undefined;
  const access = url.searchParams.get("access") ?? undefined;

  const rows = await prisma.lesson.findMany({
    where: {
      ...(course ? { course } : {}),
      ...(moduleId ? { moduleId } : {}),
      ...(access ? { access } : {}),
    },
    select: {
      id: true,
      lessonId: true,
      course: true,
      moduleId: true,
      slug: true,
      order: true,
      estMinutes: true,
      certLevel: true,
      access: true,
      titleEN: true,
      titleZH: true,
    },
    orderBy: [{ course: "asc" }, { moduleId: "asc" }, { order: "asc" }],
  });

  return Response.json(rows, { status: 200 });
}
