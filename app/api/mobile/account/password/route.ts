import { z } from "zod";
import { requireMobileAccount } from "../../../../../src/lib/mobile/account";
import { changeLocalPassword } from "../../../../../src/lib/auth/localAccount";

const Body = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
}).strict();

// Change password for the signed-in native client (bearer token, not cookies).
export async function POST(req: Request): Promise<Response> {
  const auth = await requireMobileAccount(req);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await changeLocalPassword({ userId: auth.account.userId, ...parsed.data });
  if (!result.ok) {
    const status = result.reason === "wrong_password" ? 403 : 400;
    return Response.json({ error: result.reason }, { status });
  }

  return Response.json({ ok: true });
}
