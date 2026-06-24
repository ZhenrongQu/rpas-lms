import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { getMobileCourses } from "../../../../src/lib/mobile/lessons";
import type { RouteLocale } from "../../../../src/lib/lessons/types";

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const courses = await getMobileCourses({
    userId: auth.account.userId,
    locale: localeFrom(req),
    accessTier: auth.account.accessTier,
  });

  return Response.json({ courses }, { status: 200 });
}
