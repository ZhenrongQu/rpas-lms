import { prisma } from "../../../../src/lib/db";
import { requireAdminApi } from "../../../../src/lib/auth/adminGuard";

/** GET /api/<admin>/lessons?course=&moduleId=&access= */
export async function GET(req: Request): Promise<Response> {
  const deny = await requireAdminApi();
  if (deny) return deny;

  const url = new URL(req.url);
  const course = url.searchParams.get("course") ?? undefined;
  const moduleId = url.searchParams.get("moduleId") ?? undefined;
  const access = url.searchParams.get("access") ?? undefined;

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
    estMinutes: true,
    certLevel: true,
    access: true,
    titleEN: true,
    titleZH: true,
  };
  const orderBy = [{ moduleId: "asc" as const }, { order: "asc" as const }];

  const [basic, advanced] = await Promise.all([
    course === "advanced" ? [] : prisma.basicLesson.findMany({ where, select, orderBy }),
    course === "basic" ? [] : prisma.advancedLesson.findMany({ where, select, orderBy }),
  ]);

  return Response.json([...basic, ...advanced], { status: 200 });
}
