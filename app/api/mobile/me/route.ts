import { requireMobileAccount } from "../../../../src/lib/mobile/account";

export async function GET(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  return Response.json({
    user: {
      id: auth.account.userId,
      email: auth.account.email,
      name: auth.account.name,
      accessTier: auth.account.accessTier,
    },
  });
}
