import { requireMobileAccount } from "../../../../../src/lib/mobile/account";
import { getMobileLesson } from "../../../../../src/lib/mobile/lessons";
import type { RouteLocale } from "../../../../../src/lib/lessons/types";

type Ctx = { params: Promise<{ lessonId: string }> };

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const { lessonId } = await ctx.params;
  const lesson = await getMobileLesson({
    userId: auth.account.userId,
    lessonId: decodeURIComponent(lessonId),
    locale: localeFrom(req),
    accessTier: auth.account.accessTier,
  });

  if (!lesson) return Response.json({ error: "lesson not found" }, { status: 404 });
  if (lesson.locked) return Response.json({ error: "upgrade required" }, { status: 403 });

  return Response.json(lesson, { status: 200 });
}
