import { bearerToken, readMobileSession, type MobileAccount } from "./session";

export async function currentMobileAccount(req: Request): Promise<MobileAccount | null> {
  const token = bearerToken(req.headers);
  if (!token) return null;
  return readMobileSession(token);
}

export async function requireMobileAccount(req: Request): Promise<
  | { ok: true; account: MobileAccount }
  | { ok: false; response: Response }
> {
  const account = await currentMobileAccount(req);
  if (!account) {
    return {
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    };
  }
  return { ok: true, account };
}
