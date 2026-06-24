import { requireMobileAccount } from "../../../../src/lib/mobile/account";
import { getMobileDashboard } from "../../../../src/lib/mobile/dashboard";
import type { RouteLocale } from "../../../../src/lib/lessons/types";

function localeFrom(req: Request): RouteLocale {
  return new URL(req.url).searchParams.get("locale") === "zh" ? "zh" : "en";
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  const dashboard = await getMobileDashboard({
    userId: auth.account.userId,
    accessTier: auth.account.accessTier,
    locale: localeFrom(req),
  });

  return Response.json({
    user: {
      id: auth.account.userId,
      email: auth.account.email,
      name: auth.account.name,
      accessTier: auth.account.accessTier,
    },
    ...dashboard,
  });
}
