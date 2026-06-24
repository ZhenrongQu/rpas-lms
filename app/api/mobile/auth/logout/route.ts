import { bearerToken, revokeMobileSession } from "../../../../../src/lib/mobile/session";

export async function POST(req: Request): Promise<Response> {
  const token = bearerToken(req.headers);
  if (token) await revokeMobileSession(token);
  return Response.json({ ok: true }, { status: 200 });
}
